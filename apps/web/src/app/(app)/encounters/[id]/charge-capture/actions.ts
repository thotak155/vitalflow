"use server";

import {
  CreateChargeLineInputSchema,
  UpdateChargeLineInputSchema,
  VoidChargeInputSchema,
  type ChargeId,
  type EncounterId,
  type PatientId,
} from "@vitalflow/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildBillingServices } from "../../../../../lib/billing-services.js";
import { getSession } from "../../../../../lib/session.js";

function redirectOk(encounterId: string, msg: string): never {
  redirect(`/encounters/${encounterId}?ok=${encodeURIComponent(msg)}`);
}
function redirectError(encounterId: string, msg: string): never {
  redirect(`/encounters/${encounterId}?error=${encodeURIComponent(msg)}#charge-capture`);
}

// ---------------------------------------------------------------------------
// 1. addChargeLine
// ---------------------------------------------------------------------------

export async function addChargeLine(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const patientId = String(formData.get("patient_id") ?? "");
  const rawInput = {
    patientId,
    encounterId: encounterId || null,
    cptCode: normalizeOptional(formData.get("cpt_code")),
    hcpcsCode: normalizeOptional(formData.get("hcpcs_code")),
    modifiers: parseCsv(formData.get("modifiers")).slice(0, 4),
    icd10Codes: parseCsv(formData.get("icd10_codes")).slice(0, 12),
    units: Number(formData.get("units") ?? 1),
    unitPriceMinor: dollarsToMinor(formData.get("unit_price")),
    currency: "USD",
    serviceDate: String(formData.get("service_date") ?? new Date().toISOString().slice(0, 10)),
    notes: normalizeOptional(formData.get("notes")),
  };

  const parsed = CreateChargeLineInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    redirectError(
      encounterId,
      `Invalid input: ${parsed.error.issues[0]?.message ?? "check fields"}`,
    );
  }

  const { charges } = buildBillingServices();
  try {
    await charges.create(session, parsed.data);
  } catch (err) {
    redirectError(encounterId, errorMessage(err, "Failed to add charge line"));
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirectOk(encounterId, "Charge line added");
}

// ---------------------------------------------------------------------------
// 2. updateChargeLine
// ---------------------------------------------------------------------------

export async function updateChargeLine(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const id = String(formData.get("charge_id") ?? "") as ChargeId;

  const patch = {
    cptCode: normalizeOptional(formData.get("cpt_code")),
    hcpcsCode: normalizeOptional(formData.get("hcpcs_code")),
    modifiers: parseCsv(formData.get("modifiers")).slice(0, 4),
    icd10Codes: parseCsv(formData.get("icd10_codes")).slice(0, 12),
    units: Number(formData.get("units") ?? 1),
    unitPriceMinor: dollarsToMinor(formData.get("unit_price")),
    serviceDate: String(formData.get("service_date") ?? ""),
    notes: normalizeOptional(formData.get("notes")),
  };

  const parsed = UpdateChargeLineInputSchema.safeParse(patch);
  if (!parsed.success) {
    redirectError(
      encounterId,
      `Invalid input: ${parsed.error.issues[0]?.message ?? "check fields"}`,
    );
  }

  const { charges } = buildBillingServices();
  try {
    await charges.update(session, id, parsed.data);
  } catch (err) {
    redirectError(encounterId, errorMessage(err, "Failed to update charge"));
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirectOk(encounterId, "Charge updated");
}

// ---------------------------------------------------------------------------
// 3. deleteChargeLine
// ---------------------------------------------------------------------------

export async function deleteChargeLine(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const id = String(formData.get("charge_id") ?? "") as ChargeId;

  const { charges } = buildBillingServices();
  try {
    await charges.delete(session, id);
  } catch (err) {
    redirectError(encounterId, errorMessage(err, "Failed to delete charge"));
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirectOk(encounterId, "Charge deleted");
}

// ---------------------------------------------------------------------------
// 4. postAllCharges
// ---------------------------------------------------------------------------

export async function postAllCharges(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const encounterId = String(formData.get("encounter_id") ?? "") as EncounterId;

  const { charges } = buildBillingServices();
  try {
    const result = await charges.postAllDrafts(session, encounterId);
    revalidatePath(`/encounters/${encounterId as string}`);
    const count = result.posted.length;
    const warn =
      result.warnings.length > 0
        ? ` (${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"})`
        : "";
    redirectOk(encounterId as string, `Posted ${count} charge${count === 1 ? "" : "s"}${warn}`);
  } catch (err) {
    redirectError(encounterId as string, errorMessage(err, "Failed to post charges"));
  }
}

// ---------------------------------------------------------------------------
// 5. voidChargeLine
// ---------------------------------------------------------------------------

export async function voidChargeLine(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const id = String(formData.get("charge_id") ?? "") as ChargeId;
  const reason = String(formData.get("reason") ?? "").trim();

  const parsed = VoidChargeInputSchema.safeParse({ reason });
  if (!parsed.success) {
    redirectError(
      encounterId,
      `Invalid input: ${parsed.error.issues[0]?.message ?? "check reason"}`,
    );
  }

  const { charges } = buildBillingServices();
  try {
    await charges.void(session, id, parsed.data);
  } catch (err) {
    redirectError(encounterId, errorMessage(err, "Failed to void charge"));
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirectOk(encounterId, "Charge voided");
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function normalizeOptional(v: string | File | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function parseCsv(v: string | File | null): string[] {
  if (!v) return [];
  return String(v)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function dollarsToMinor(v: string | File | null): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace(/[$,]/g, "");
  if (!s) return 0;
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

// Silence unused import of PatientId — consumed from types for FormData
// narrowing in future iterations; kept exported so this module stays the
// single source for action signatures.
export type _Unused = PatientId;
