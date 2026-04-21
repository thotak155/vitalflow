import { logEventBestEffort } from "@vitalflow/auth/audit";
import { badState, forbidden, notFound } from "@vitalflow/shared-utils/errors";

import type { PatientBalanceDataAccess } from "./supabase-data-access.js";
import type {
  AgingBand,
  BalanceDeltaInput,
  BalanceListFilter,
  Insert,
  PatientBalance,
  PatientBalanceService,
  PatientId,
  TenantContext,
} from "@vitalflow/types";

/**
 * PatientBalanceServiceImpl — the missing keystone of V1 billing.
 *
 * Owns the `patient_balances` cached rollup. Called by:
 *   - PaymentServiceImpl.record / refund
 *   - ChargeServiceImpl.post (via applyDelta after a charge transitions to posted)
 *   - a future admin tool for full recomputes
 *
 * Invariants enforced here AND in the DB:
 *   - sum(aging_buckets) == current_balance_minor
 *   - older aging buckets (31+) never go negative
 *   - 0-30 CAN go negative (patient credit)
 *
 * Delta application policy (docs/billing-rcm.md §3.5):
 *   - Positive delta lands on `band` (default 0-30)
 *   - Negative delta drains oldest-first: over-90 → 61-90 → 31-60 → 0-30
 *     Any residual past the oldest three falls on 0-30 (which may go negative).
 */

export interface PatientBalanceServiceDeps {
  readonly data: PatientBalanceDataAccess;
  readonly clock?: () => Date;
}

export class PatientBalanceServiceImpl implements PatientBalanceService {
  constructor(private readonly deps: PatientBalanceServiceDeps) {}

  async get(ctx: TenantContext, patientId: PatientId): Promise<PatientBalance> {
    requireRead(ctx);
    const existing = await this.deps.data.getByTenantAndPatient(ctx.tenantId, patientId);
    if (existing) return existing;
    // Lazy zero-fill when a consumer asks about a patient with no activity.
    // We don't insert a row here — the next applyDelta will do so. This keeps
    // the DB clean of empty rows for patients we just happened to view.
    return zeroBalanceFor(ctx.tenantId, patientId);
  }

  async list(ctx: TenantContext, filter: BalanceListFilter): Promise<readonly PatientBalance[]> {
    requireRead(ctx);
    return this.deps.data.list(ctx.tenantId, {
      band: filter.band,
      minBalanceMinor: filter.minBalanceMinor,
      maxBalanceMinor: filter.maxBalanceMinor,
      sort: filter.sort,
      limit: filter.limit,
      offset: filter.offset,
    });
  }

  /**
   * Full recompute from source data: charges posted (minus voided) minus
   * payments received. V1 puts the whole net amount in 0-30 — aging-bucket
   * advancement is a separate nightly job (not in V1).
   */
  async recalculate(ctx: TenantContext, patientId: PatientId): Promise<PatientBalance> {
    requireWrite(ctx);

    const [chargeTotal, paymentTotal] = await Promise.all([
      this.deps.data.sumChargesForPatient(ctx.tenantId, patientId),
      this.deps.data.sumPaymentsForPatient(ctx.tenantId, patientId),
    ]);

    const current = chargeTotal - paymentTotal;
    const existing = await this.deps.data.getByTenantAndPatient(ctx.tenantId, patientId);

    const row: Insert<"patient_balances"> = {
      id: existing?.id as string | undefined,
      tenant_id: ctx.tenantId,
      patient_id: patientId as string,
      current_balance_minor: current,
      aging_0_30_minor: current,
      aging_31_60_minor: 0,
      aging_61_90_minor: 0,
      aging_over_90_minor: 0,
      currency: existing?.currency ?? "USD",
      last_payment_at: existing?.lastPaymentAt ?? null,
      last_statement_at: existing?.lastStatementAt ?? null,
    };

    const saved = await this.deps.data.upsert(row);

    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "patient_balance.recalculated",
      targetTable: "patient_balances",
      targetRowId: saved.id as string,
      details: {
        patient_id: patientId as string,
        charges_total_minor: chargeTotal,
        payments_total_minor: paymentTotal,
        current_balance_minor: current,
      },
    });

    return saved;
  }

  /**
   * Transactional-ish delta application. Called by PaymentService.record and
   * ChargeService.post. Lazily creates the row if it doesn't exist.
   *
   * Not atomic-at-the-DB-level in V1 — race between two concurrent applyDelta
   * calls for the same patient is a known V1 limitation (docs §6). A follow-up
   * migration adds a PL/pgSQL function that runs the delta inside a DB
   * transaction with row-level lock.
   */
  async applyDelta(ctx: TenantContext, input: BalanceDeltaInput): Promise<PatientBalance> {
    requireWrite(ctx);

    const existing =
      (await this.deps.data.getByTenantAndPatient(ctx.tenantId, input.patientId)) ??
      zeroBalanceFor(ctx.tenantId, input.patientId);

    const next = applyDeltaLocally(existing, input);

    if (next.agingOver90Minor < 0 || next.aging31_60Minor < 0 || next.aging61_90Minor < 0) {
      // Should be impossible given our allocation policy, but guard rather
      // than hit a DB constraint error at runtime.
      throw badState("Aging bucket went negative on an older band — allocation bug", {
        aging_0_30: next.aging0_30Minor,
        aging_31_60: next.aging31_60Minor,
        aging_61_90: next.aging61_90Minor,
        aging_over_90: next.agingOver90Minor,
      });
    }

    const row: Insert<"patient_balances"> = {
      id: existing.id as string | undefined,
      tenant_id: ctx.tenantId,
      patient_id: input.patientId as string,
      current_balance_minor: next.currentBalanceMinor,
      aging_0_30_minor: next.aging0_30Minor,
      aging_31_60_minor: next.aging31_60Minor,
      aging_61_90_minor: next.aging61_90Minor,
      aging_over_90_minor: next.agingOver90Minor,
      currency: existing.currency,
      last_payment_at:
        input.touchPayment && this.now()
          ? this.now().toISOString()
          : (existing.lastPaymentAt ?? null),
      last_statement_at: existing.lastStatementAt ?? null,
    };
    return this.deps.data.upsert(row);
  }

  // -------------------------------------------------------------------------

  private now(): Date {
    return this.deps.clock ? this.deps.clock() : new Date();
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Apply a delta to a PatientBalance, returning the new rollup. Never mutates
 * the input. Pure — no IO, no clock reads.
 */
export function applyDeltaLocally(
  current: PatientBalance,
  input: BalanceDeltaInput,
): PatientBalance {
  if (input.deltaMinor === 0) return current;

  const nextCurrent = current.currentBalanceMinor + input.deltaMinor;
  if (input.deltaMinor > 0) {
    const band: AgingBand = input.band ?? "0-30";
    return withBandPlus(current, band, input.deltaMinor, nextCurrent);
  }
  // Negative delta — drain oldest first.
  return drainNegative(current, Math.abs(input.deltaMinor), nextCurrent);
}

function withBandPlus(
  current: PatientBalance,
  band: AgingBand,
  amount: number,
  nextCurrent: number,
): PatientBalance {
  const next = { ...current, currentBalanceMinor: nextCurrent };
  switch (band) {
    case "0-30":
      next.aging0_30Minor = current.aging0_30Minor + amount;
      break;
    case "31-60":
      next.aging31_60Minor = current.aging31_60Minor + amount;
      break;
    case "61-90":
      next.aging61_90Minor = current.aging61_90Minor + amount;
      break;
    case "over-90":
      next.agingOver90Minor = current.agingOver90Minor + amount;
      break;
  }
  return next;
}

function drainNegative(current: PatientBalance, abs: number, nextCurrent: number): PatientBalance {
  let remaining = abs;
  let over90 = current.agingOver90Minor;
  let b61_90 = current.aging61_90Minor;
  let b31_60 = current.aging31_60Minor;
  let b0_30 = current.aging0_30Minor;

  // Older-first drain. Only the oldest three have a floor at zero; the
  // 0-30 bucket absorbs any residual (can go negative — credit on account).
  const takeFrom = (bucket: number): [taken: number, left: number] => {
    if (remaining <= 0 || bucket <= 0) return [0, bucket];
    const t = Math.min(remaining, bucket);
    remaining -= t;
    return [t, bucket - t];
  };

  [, over90] = takeFrom(over90);
  [, b61_90] = takeFrom(b61_90);
  [, b31_60] = takeFrom(b31_60);
  // Anything left drains from 0-30 (can dip negative).
  b0_30 -= remaining;

  return {
    ...current,
    currentBalanceMinor: nextCurrent,
    aging0_30Minor: b0_30,
    aging31_60Minor: b31_60,
    aging61_90Minor: b61_90,
    agingOver90Minor: over90,
  };
}

function zeroBalanceFor(tenantId: string, patientId: PatientId): PatientBalance {
  const now = new Date().toISOString();
  return {
    id: "00000000-0000-0000-0000-000000000000" as PatientBalance["id"],
    tenantId: tenantId as PatientBalance["tenantId"],
    patientId,
    currentBalanceMinor: 0,
    aging0_30Minor: 0,
    aging31_60Minor: 0,
    aging61_90Minor: 0,
    agingOver90Minor: 0,
    currency: "USD",
    lastPaymentAt: null,
    lastStatementAt: null,
    createdAt: now,
    updatedAt: now,
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

// Re-exported so callers can construct a zero-filled balance for pre-activity patients.
export { zeroBalanceFor };
// notFound is re-exported for external test fixtures that want to simulate "not found" paths.
export { notFound };
