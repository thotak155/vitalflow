"use server";

import type { DenialId, UserId } from "@vitalflow/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { redirectWithError, redirectWithOk } from "../../../../lib/action-errors.js";
import { buildBillingServices } from "../../../../lib/billing-services.js";
import { getSession } from "../../../../lib/session.js";

/**
 * Server actions for denial queue + detail page. Thin callers over
 * `DenialServiceImpl` — every rule, audit event, and state transition lives
 * in the service.
 */

function denialUrl(id: string): string {
  return `/billing/denials/${id}`;
}

function revalidateDenial(id: string): void {
  revalidatePath(denialUrl(id));
  revalidatePath("/billing/denials");
}

// ---------------------------------------------------------------------------

export async function assignDenial(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("denial_id") ?? "");
  const assignee = String(formData.get("assignee") ?? "");
  if (!id) redirectWithError("/billing/denials", new Error("Missing denial id"));

  const { denials } = buildBillingServices();
  try {
    await denials.assign(session, id as DenialId, {
      assignedTo: assignee as UserId,
    });
  } catch (err) {
    redirectWithError(denialUrl(id), err);
  }

  revalidateDenial(id);
  redirectWithOk(denialUrl(id), "Denial assigned");
}

// ---------------------------------------------------------------------------

export async function assignDenialToMe(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("denial_id") ?? "");
  if (!id) redirectWithError("/billing/denials", new Error("Missing denial id"));

  const { denials } = buildBillingServices();
  try {
    await denials.assign(session, id as DenialId, {
      assignedTo: session.userId as UserId,
    });
  } catch (err) {
    redirectWithError(denialUrl(id), err);
  }

  revalidateDenial(id);
  redirectWithOk(denialUrl(id), "Assigned to you");
}

// ---------------------------------------------------------------------------

export async function recordDenialWork(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("denial_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const { denials } = buildBillingServices();
  try {
    await denials.recordWork(session, id as DenialId, { workNote: note });
  } catch (err) {
    redirectWithError(denialUrl(id), err);
  }

  revalidateDenial(id);
  redirectWithOk(denialUrl(id), "Work note recorded");
}

// ---------------------------------------------------------------------------

export async function resolveDenial(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("denial_id") ?? "");
  const resolution = String(formData.get("resolution") ?? "").trim();
  const recoveredDollars = String(formData.get("recovered_amount") ?? "").trim();
  const recoveredAmountMinor = recoveredDollars
    ? Math.max(0, Math.round(Number.parseFloat(recoveredDollars) * 100))
    : 0;

  const { denials } = buildBillingServices();
  try {
    await denials.resolve(session, id as DenialId, {
      resolution,
      recoveredAmountMinor,
    });
  } catch (err) {
    redirectWithError(denialUrl(id), err);
  }

  revalidateDenial(id);
  redirectWithOk(denialUrl(id), "Denial resolved");
}

// ---------------------------------------------------------------------------

export async function writeOffDenial(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("denial_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  const { denials } = buildBillingServices();
  try {
    await denials.writeOff(session, id as DenialId, { reason });
  } catch (err) {
    redirectWithError(denialUrl(id), err);
  }

  revalidateDenial(id);
  redirectWithOk(denialUrl(id), "Denial written off");
}

// ---------------------------------------------------------------------------

export async function appealDenial(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("denial_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const { denials } = buildBillingServices();
  try {
    await denials.appeal(session, id as DenialId, { note });
  } catch (err) {
    redirectWithError(denialUrl(id), err);
  }

  revalidateDenial(id);
  redirectWithOk(denialUrl(id), "Appeal recorded");
}
