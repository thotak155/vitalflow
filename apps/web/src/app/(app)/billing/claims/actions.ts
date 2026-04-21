"use server";

import type { ClaimId } from "@vitalflow/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { redirectWithError, redirectWithOk } from "../../../../lib/action-errors.js";
import { buildBillingServices } from "../../../../lib/billing-services.js";
import { getSession } from "../../../../lib/session.js";

/**
 * Server actions for the claims dashboard. Every handler is a thin:
 *   1. parse form → 2. call `ClaimServiceImpl.*` → 3. redirect with banner
 *
 * Business logic, state transitions, history-row writes, and audit-event
 * emission all live inside the service layer. Permission enforcement and
 * impersonation stripping come from `session.permissions` (stripped by
 * `permissionsFor()` — see Phase 1 rbac.ts changes).
 */

function claimUrl(id: string): string {
  return `/billing/claims/${id}`;
}

// ---------------------------------------------------------------------------

export async function markClaimReady(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const claimId = String(formData.get("claim_id") ?? "");
  if (!claimId) redirectWithError("/billing/claims", new Error("Missing claim id"));

  const { claims } = buildBillingServices();
  try {
    await claims.markReady(session, claimId as ClaimId);
  } catch (err) {
    redirectWithError(claimUrl(claimId), err);
  }

  revalidatePath(claimUrl(claimId));
  redirectWithOk(claimUrl(claimId), "Claim marked ready");
}

// ---------------------------------------------------------------------------

export async function submitClaim(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const claimId = String(formData.get("claim_id") ?? "");
  if (!claimId) redirectWithError("/billing/claims", new Error("Missing claim id"));

  const { claims } = buildBillingServices();
  try {
    await claims.submit(session, claimId as ClaimId);
  } catch (err) {
    // Expected: INTEGRATION_NOT_CONFIGURED until a clearinghouse adapter lands.
    redirectWithError(claimUrl(claimId), err);
  }

  revalidatePath(claimUrl(claimId));
  redirectWithOk(claimUrl(claimId), "Claim submitted");
}

// ---------------------------------------------------------------------------

export async function applyRemittance(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const claimId = String(formData.get("claim_id") ?? "");
  if (!claimId) redirectWithError("/billing/claims", new Error("Missing claim id"));

  // UI doesn't yet post an 835 payload. When it does, parse formData and
  // pass `ApplyRemittanceInput` below. For now this always surfaces
  // INTEGRATION_NOT_CONFIGURED via the service.
  const { claims } = buildBillingServices();
  try {
    await claims.applyRemittance(session, claimId as ClaimId, {
      adjudicatedAt: new Date().toISOString(),
      patientRespMinor: 0,
      lines: [],
    });
  } catch (err) {
    redirectWithError(claimUrl(claimId), err);
  }

  revalidatePath(claimUrl(claimId));
  redirectWithOk(claimUrl(claimId), "Remittance applied");
}

// ---------------------------------------------------------------------------

export async function appealClaim(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const claimId = String(formData.get("claim_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  const { claims } = buildBillingServices();
  try {
    await claims.appeal(session, claimId as ClaimId, {
      reason,
      supportingDocs: [],
    });
  } catch (err) {
    redirectWithError(claimUrl(claimId), err);
  }

  revalidatePath(claimUrl(claimId));
  redirectWithOk(claimUrl(claimId), "Appeal recorded");
}

// ---------------------------------------------------------------------------

export async function closeClaim(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const claimId = String(formData.get("claim_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  const { claims } = buildBillingServices();
  try {
    await claims.close(session, claimId as ClaimId, { reason });
  } catch (err) {
    redirectWithError(claimUrl(claimId), err);
  }

  revalidatePath(claimUrl(claimId));
  redirectWithOk(claimUrl(claimId), "Claim closed");
}
