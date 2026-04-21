import { randomUUID } from "node:crypto";

import { logEventBestEffort } from "@vitalflow/auth/audit";
import {
  badState,
  forbidden,
  integrationNotConfigured,
  notFound,
  validation,
} from "@vitalflow/shared-utils/errors";
import {
  AppealClaimInputSchema,
  ApplyRemittanceInputSchema,
  CloseClaimInputSchema,
  CreateClaimFromChargesInputSchema,
  type AppealClaimInput,
  type ApplyRemittanceInput,
  type Claim,
  type ClaimId,
  type ClaimLine,
  type ClaimListFilter,
  type ClaimService,
  type ClaimStatus,
  type ClaimStatusHistory,
  type ClaimWithLines,
  type CloseClaimInput,
  type CreateClaimFromChargesInput,
  type Insert,
  type PatientCoverageId,
  type PatientId,
  type PayerId,
  type Row,
  type TenantContext,
  type TenantId,
  type UserId,
} from "@vitalflow/types";

import type { ClaimBundle, ClaimDataAccess } from "./supabase-data-access.js";

/**
 * ClaimServiceImpl — claim lifecycle + remittance orchestration.
 *
 * In scope for V1 (fully functional):
 *   - list / getById
 *   - createFromCharges (validates posted-status on every charge)
 *   - markReady (draft → ready)
 *   - appeal (denied/partial/rejected → appealed)
 *   - close (any → closed)
 *
 * Deferred to the clearinghouse adapter:
 *   - submit (ready → submitted) — throws INTEGRATION_NOT_CONFIGURED
 *   - applyRemittance — same
 *
 * The submit seam takes a `ClearinghouseSubmitter` dep. When an
 * implementation lands (Availity / Change Healthcare / Claim.MD), swap the
 * stub in the deps; no service/action/UI edits needed.
 */

export interface ClearinghouseSubmitter {
  submit837(
    claim: Claim,
    lines: readonly ClaimLine[],
  ): Promise<{ readonly externalClaimId: string; readonly ediEnvelope: string }>;
}

export interface ClaimServiceDeps {
  readonly data: ClaimDataAccess;
  /** Optional — when omitted, submit returns INTEGRATION_NOT_CONFIGURED. */
  readonly clearinghouse?: ClearinghouseSubmitter;
  readonly clock?: () => Date;
  /** Numbering function — override in tests; default generates `CLM-{YYYY}-{random6}`. */
  readonly claimNumberer?: () => string;
}

export class ClaimServiceImpl implements ClaimService {
  constructor(private readonly deps: ClaimServiceDeps) {}

  async list(ctx: TenantContext, filter: ClaimListFilter): Promise<readonly Claim[]> {
    requireRead(ctx);
    const rows = await this.deps.data.list(ctx.tenantId, {
      status: filter.status,
      patientId: filter.patientId,
      payerId: filter.payerId,
      serviceStartAfter: filter.serviceStartAfter,
      serviceEndBefore: filter.serviceEndBefore,
      limit: filter.limit,
      offset: filter.offset,
    });
    return rows.map(claimRowToDomain);
  }

  async getById(ctx: TenantContext, id: ClaimId): Promise<ClaimWithLines | null> {
    requireRead(ctx);
    const bundle = await this.deps.data.getBundle(ctx.tenantId, id as string);
    if (!bundle) return null;
    return bundleToDomain(bundle);
  }

  async createFromCharges(
    ctx: TenantContext,
    input: CreateClaimFromChargesInput,
  ): Promise<ClaimWithLines> {
    requireWrite(ctx);
    if (ctx.impersonation) {
      throw forbidden("Cannot create claims while impersonating");
    }
    const parsed = CreateClaimFromChargesInputSchema.parse(input);

    // Load + validate every charge.
    const charges = await this.deps.data.getChargesForClaim(
      ctx.tenantId,
      parsed.chargeIds as string[],
    );
    if (charges.length !== parsed.chargeIds.length) {
      throw validation("One or more charges not found or belong to another tenant", {
        requested: parsed.chargeIds.length,
        found: charges.length,
      });
    }

    const notPosted = charges.filter((c) => c.status !== "posted");
    if (notPosted.length > 0) {
      throw badState("All charges must be in 'posted' status to join a claim", {
        offending_statuses: [...new Set(notPosted.map((c) => c.status))],
      });
    }

    // Every charge must be on the same patient. (Mixed-patient claims are a V2 edge case.)
    const patientIds = new Set(charges.map((c) => c.patient_id));
    if (patientIds.size !== 1) {
      throw validation("All charges on a claim must belong to the same patient", {
        distinct_patients: patientIds.size,
      });
    }
    const [patientId] = [...patientIds];

    const total = charges.reduce((s, c) => s + c.total_minor, 0);
    const minDate = charges.map((c) => c.service_date).sort()[0]!;
    const maxDate = charges
      .map((c) => c.service_date)
      .sort()
      .reverse()[0]!;

    const claimId = randomUUID();
    const claimRow: Insert<"claims"> = {
      id: claimId,
      tenant_id: ctx.tenantId,
      patient_id: patientId!,
      payer_id: parsed.payerId as string,
      coverage_id: (parsed.coverageId ?? null) as string | null,
      number: this.nextClaimNumber(),
      status: "draft",
      billing_provider_id: (parsed.billingProviderId ?? null) as string | null,
      rendering_provider_id: (parsed.renderingProviderId ?? null) as string | null,
      service_start_date: minDate,
      service_end_date: maxDate,
      total_minor: total,
      currency: charges[0]?.currency ?? "USD",
      metadata: {},
    };

    const lineRows: Insert<"claim_lines">[] = charges.map((c, i) => ({
      tenant_id: ctx.tenantId,
      claim_id: claimId,
      charge_id: c.id,
      line_number: i + 1,
      cpt_code: c.cpt_code ?? null,
      modifiers: c.modifiers ?? [],
      icd10_codes: c.icd10_codes ?? [],
      units: c.units,
      charge_minor: c.total_minor,
      currency: c.currency,
      service_date: c.service_date,
    }));

    const bundle = await this.deps.data.insertClaimWithLines({
      claim: claimRow,
      lines: lineRows,
    });
    await this.deps.data.insertHistory({
      tenant_id: ctx.tenantId,
      claim_id: claimId,
      from_status: null,
      to_status: "draft",
      occurred_at: this.now().toISOString(),
      actor_id: ctx.userId,
      message: `Claim created from ${charges.length} charge(s)`,
      payload: { charge_ids: parsed.chargeIds as string[] },
    });

    return bundleToDomain(bundle);
  }

  async markReady(ctx: TenantContext, id: ClaimId): Promise<Claim> {
    requireWrite(ctx);
    if (ctx.impersonation) throw forbidden("Cannot update claims while impersonating");

    const current = await this.requireStatus(ctx, id, "draft", "markReady");
    const updated = await this.deps.data.updateStatus(ctx.tenantId, id as string, {
      status: "ready",
    });
    await this.writeHistory(ctx, id, current, "ready", null);
    await this.emitStatusChanged(ctx, id, current, "ready");
    return claimRowToDomain(updated);
  }

  async submit(ctx: TenantContext, id: ClaimId): Promise<Claim> {
    requireWrite(ctx);
    if (ctx.impersonation) throw forbidden("Cannot submit claims while impersonating");
    await this.requireStatus(ctx, id, "ready", "submit");

    if (!this.deps.clearinghouse) {
      throw integrationNotConfigured("clearinghouse");
    }

    // TODO(clearinghouse): call deps.clearinghouse.submit837(claim, lines)
    // and persist externalClaimId + ediEnvelope before transitioning to
    // 'submitted'. Left intentionally unreachable here because V1 default
    // deps.clearinghouse is undefined; the interface + dep slot exist so a
    // real adapter drops in without service changes.
    throw integrationNotConfigured("clearinghouse", {
      hint: "Wire a ClearinghouseSubmitter into ClaimServiceImpl deps",
    });
  }

  async applyRemittance(
    _ctx: TenantContext,
    _id: ClaimId,
    input: ApplyRemittanceInput,
  ): Promise<ClaimWithLines> {
    requireWrite(_ctx);
    // Validate the shape even though we won't consume it in V1.
    ApplyRemittanceInputSchema.parse(input);
    throw integrationNotConfigured("clearinghouse_remittance", {
      hint: "835 parsing + line-level posting ships with the clearinghouse adapter",
    });
  }

  async appeal(ctx: TenantContext, id: ClaimId, input: AppealClaimInput): Promise<Claim> {
    requireWrite(ctx);
    const parsed = AppealClaimInputSchema.parse(input);
    const current = await this.getCurrentStatus(ctx, id);
    if (!current) throw notFound(`claim ${id as string} not found`);
    if (!["denied", "partial", "rejected"].includes(current)) {
      throw badState(`cannot appeal a claim in status '${current}'`, {
        current_status: current,
      });
    }

    const updated = await this.deps.data.updateStatus(ctx.tenantId, id as string, {
      status: "appealed",
    });
    await this.writeHistory(ctx, id, current, "appealed", parsed.reason);
    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "claim.appealed",
      targetTable: "claims",
      targetRowId: id as string,
      details: { from: current, reason_length: parsed.reason.length },
    });
    return claimRowToDomain(updated);
  }

  async close(ctx: TenantContext, id: ClaimId, input: CloseClaimInput): Promise<Claim> {
    requireWrite(ctx);
    const parsed = CloseClaimInputSchema.parse(input);
    const current = await this.getCurrentStatus(ctx, id);
    if (!current) throw notFound(`claim ${id as string} not found`);
    if (current === "closed") throw badState("claim already closed");

    const updated = await this.deps.data.updateStatus(ctx.tenantId, id as string, {
      status: "closed",
    });
    await this.writeHistory(ctx, id, current, "closed", parsed.reason);
    await this.emitStatusChanged(ctx, id, current, "closed");
    return claimRowToDomain(updated);
  }

  // -------------------------------------------------------------------------

  private async getCurrentStatus(ctx: TenantContext, id: ClaimId): Promise<ClaimStatus | null> {
    return this.deps.data.getStatus(ctx.tenantId, id as string);
  }

  private async requireStatus(
    ctx: TenantContext,
    id: ClaimId,
    expected: ClaimStatus,
    op: string,
  ): Promise<ClaimStatus> {
    const current = await this.getCurrentStatus(ctx, id);
    if (!current) throw notFound(`claim ${id as string} not found`);
    if (current !== expected) {
      throw badState(`cannot ${op} from status '${current}'; expected '${expected}'`, {
        current_status: current,
        expected_status: expected,
      });
    }
    return current;
  }

  private async writeHistory(
    ctx: TenantContext,
    id: ClaimId,
    from: ClaimStatus,
    to: ClaimStatus,
    message: string | null,
  ): Promise<void> {
    await this.deps.data.insertHistory({
      tenant_id: ctx.tenantId,
      claim_id: id as string,
      from_status: from,
      to_status: to,
      occurred_at: this.now().toISOString(),
      actor_id: ctx.userId,
      message,
      payload: {},
    });
  }

  private async emitStatusChanged(
    ctx: TenantContext,
    id: ClaimId,
    from: ClaimStatus,
    to: ClaimStatus,
  ): Promise<void> {
    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "claim.status_changed",
      targetTable: "claims",
      targetRowId: id as string,
      details: { from, to },
    });
  }

  private now(): Date {
    return this.deps.clock ? this.deps.clock() : new Date();
  }

  private nextClaimNumber(): string {
    if (this.deps.claimNumberer) return this.deps.claimNumberer();
    const year = this.now().getUTCFullYear();
    const rand = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0");
    return `CLM-${year}-${rand}`;
  }
}

// ---------------------------------------------------------------------------
// Domain mappers (row → Claim / ClaimLine / ClaimStatusHistory)
// ---------------------------------------------------------------------------

function claimRowToDomain(row: Row<"claims">): Claim {
  return {
    id: row.id as ClaimId,
    tenantId: row.tenant_id as TenantId,
    patientId: row.patient_id as PatientId,
    payerId: row.payer_id as PayerId,
    coverageId: (row.coverage_id ?? null) as PatientCoverageId | null,
    number: row.number,
    status: row.status as ClaimStatus,
    billingProviderId: (row.billing_provider_id ?? null) as UserId | null,
    renderingProviderId: (row.rendering_provider_id ?? null) as UserId | null,
    serviceStartDate: row.service_start_date,
    serviceEndDate: row.service_end_date,
    totalMinor: row.total_minor,
    allowedMinor: row.allowed_minor ?? null,
    paidMinor: row.paid_minor ?? 0,
    patientRespMinor: row.patient_resp_minor ?? 0,
    currency: row.currency,
    submittedAt: row.submitted_at ?? null,
    adjudicatedAt: row.adjudicated_at ?? null,
    externalClaimId: row.external_claim_id ?? null,
    ediEnvelope: row.edi_envelope ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function claimLineRowToDomain(row: Row<"claim_lines">): ClaimLine {
  return {
    id: row.id as ClaimLine["id"],
    tenantId: row.tenant_id as TenantId,
    claimId: row.claim_id as ClaimId,
    chargeId: row.charge_id as ClaimLine["chargeId"],
    lineNumber: row.line_number,
    cptCode: row.cpt_code ?? null,
    modifiers: row.modifiers ?? [],
    icd10Codes: row.icd10_codes ?? [],
    units: row.units,
    chargeMinor: row.charge_minor,
    allowedMinor: row.allowed_minor ?? null,
    paidMinor: row.paid_minor ?? 0,
    adjustmentMinor: row.adjustment_minor ?? 0,
    denialCodes: row.denial_codes ?? [],
    currency: row.currency,
    serviceDate: row.service_date,
    createdAt: row.created_at,
  };
}

function historyRowToDomain(row: Row<"claim_status_history">): ClaimStatusHistory {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    claimId: row.claim_id as ClaimId,
    fromStatus: (row.from_status ?? null) as ClaimStatus | null,
    toStatus: row.to_status as ClaimStatus,
    occurredAt: row.occurred_at,
    actorId: (row.actor_id ?? null) as UserId | null,
    message: row.message ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
  };
}

function bundleToDomain(bundle: ClaimBundle): ClaimWithLines {
  return {
    claim: claimRowToDomain(bundle.claim),
    lines: bundle.lines.map(claimLineRowToDomain),
    history: bundle.history.map(historyRowToDomain),
  };
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

function requireRead(ctx: TenantContext): void {
  if (!ctx.permissions.includes("billing:read")) {
    throw forbidden("billing:read required");
  }
}

function requireWrite(ctx: TenantContext): void {
  if (!ctx.permissions.includes("billing:write")) {
    throw forbidden("billing:write required");
  }
}
