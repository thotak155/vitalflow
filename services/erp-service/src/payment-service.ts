import { logEventBestEffort } from "@vitalflow/auth/audit";
import { badState, forbidden, notFound, validation } from "@vitalflow/shared-utils/errors";
import {
  RecordPaymentInputSchema,
  RefundPaymentInputSchema,
  type Insert,
  type Payment,
  type PaymentId,
  type PaymentListFilter,
  type PaymentService,
  type RecordPaymentInput,
  type RefundPaymentInput,
  type TenantContext,
} from "@vitalflow/types";

import type { PatientBalanceServiceImpl } from "./patient-balance-service.js";
import type { PaymentDataAccess } from "./supabase-data-access.js";

/**
 * PaymentServiceImpl — records payments and keeps patient A/R in sync.
 *
 * Every patient-sourced `record` (cash / card / ach / check) calls
 * `PatientBalanceService.applyDelta` with a negative delta so the A/R rollup
 * decrements in the same logical operation. Insurance payments DO NOT touch
 * patient_balances — the patient's responsibility moves via remittance on
 * the claim, not by payer payment.
 *
 * Refunds: V1 convention is a second row with sign-flipped `amount_minor`.
 * Original payment is never modified.
 *
 * Integration seams (explicitly deferred):
 *   - 835 remittance post (ClaimService.applyRemittance) creates insurance
 *     payments — wired when the clearinghouse adapter lands.
 *   - Processor integrations (Stripe, payment terminal) populate
 *     `processor_ref`; this service just stores what it's given.
 */

export interface PaymentServiceDeps {
  readonly data: PaymentDataAccess;
  readonly balances: PatientBalanceServiceImpl;
  readonly clock?: () => Date;
}

export class PaymentServiceImpl implements PaymentService {
  constructor(private readonly deps: PaymentServiceDeps) {}

  async list(ctx: TenantContext, filter: PaymentListFilter): Promise<readonly Payment[]> {
    requireRead(ctx);
    return this.deps.data.list(ctx.tenantId, {
      patientId: filter.patientId,
      invoiceId: filter.invoiceId,
      payerId: filter.payerId,
      method: filter.method,
      receivedAfter: filter.receivedAfter,
      receivedBefore: filter.receivedBefore,
      limit: filter.limit,
      offset: filter.offset,
    });
  }

  async record(ctx: TenantContext, input: RecordPaymentInput): Promise<Payment> {
    requireCollect(ctx);

    const parsed = RecordPaymentInputSchema.parse(input);

    if (!withinNowOrPast(parsed.receivedAt, this.now())) {
      throw validation("received_at cannot be in the future");
    }

    const row: Insert<"payments"> = {
      tenant_id: ctx.tenantId,
      invoice_id: parsed.invoiceId ?? null,
      patient_id: parsed.patientId ?? null,
      payer_id: parsed.payerId ?? null,
      method: parsed.method,
      amount_minor: parsed.amountMinor,
      currency: parsed.currency,
      received_at: parsed.receivedAt,
      reference: parsed.reference ?? null,
      processor: parsed.processor ?? null,
      processor_ref: parsed.processorRef ?? null,
      notes: parsed.notes ?? null,
    };

    const payment = await this.deps.data.insert(row);

    // Patient-sourced payment → update A/R. Insurance payments do not.
    if (parsed.patientId && parsed.method !== "insurance") {
      await this.deps.balances.applyDelta(ctx, {
        patientId: parsed.patientId,
        deltaMinor: -parsed.amountMinor,
        band: "0-30",
        touchPayment: true,
      });
    }

    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "payment.recorded",
      targetTable: "payments",
      targetRowId: payment.id as string,
      details: {
        method: parsed.method,
        amount_minor: parsed.amountMinor,
        invoice_id: parsed.invoiceId ?? null,
        has_patient: !!parsed.patientId,
        has_payer: !!parsed.payerId,
      },
    });

    return payment;
  }

  async refund(ctx: TenantContext, id: PaymentId, input: RefundPaymentInput): Promise<Payment> {
    requireAdjust(ctx);
    const parsed = RefundPaymentInputSchema.parse(input);

    const original = await this.deps.data.getById(ctx.tenantId, id);
    if (!original) throw notFound(`payment ${id} not found`);

    if (original.amountMinor < 0) {
      throw badState("Cannot refund a refund — refund the original payment instead", {
        original_amount_minor: original.amountMinor,
      });
    }
    if (parsed.amountMinor > original.amountMinor) {
      throw validation("Refund amount exceeds original payment amount", {
        refund: parsed.amountMinor,
        original: original.amountMinor,
      });
    }

    const refundRow: Insert<"payments"> = {
      tenant_id: ctx.tenantId,
      invoice_id: original.invoiceId ?? null,
      patient_id: original.patientId ?? null,
      payer_id: original.payerId ?? null,
      method: original.method,
      amount_minor: -parsed.amountMinor,
      currency: original.currency,
      received_at: this.now().toISOString(),
      reference: original.reference ?? null,
      processor: original.processor ?? null,
      processor_ref: original.processorRef ?? null,
      notes: `REFUND of ${original.id as string}: ${parsed.reason}`,
    };

    const refund = await this.deps.data.insert(refundRow);

    // Reverse the A/R impact for patient-sourced refunds.
    if (original.patientId && original.method !== "insurance") {
      await this.deps.balances.applyDelta(ctx, {
        patientId: original.patientId,
        deltaMinor: parsed.amountMinor,
        band: "0-30",
        touchPayment: true,
      });
    }

    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "payment.refunded",
      targetTable: "payments",
      targetRowId: refund.id as string,
      details: {
        original_payment_id: original.id as string,
        refund_amount_minor: parsed.amountMinor,
        reason_length: parsed.reason.length,
      },
    });

    return refund;
  }

  private now(): Date {
    return this.deps.clock ? this.deps.clock() : new Date();
  }
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

function requireRead(ctx: TenantContext): void {
  if (!ctx.permissions.includes("billing:read")) {
    throw forbidden("billing:read required");
  }
}

function requireCollect(ctx: TenantContext): void {
  if (!ctx.permissions.includes("billing:collect")) {
    throw forbidden("billing:collect required");
  }
}

function requireAdjust(ctx: TenantContext): void {
  if (!ctx.permissions.includes("billing:adjust")) {
    throw forbidden("billing:adjust required");
  }
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function withinNowOrPast(isoTime: string, now: Date): boolean {
  const t = new Date(isoTime).getTime();
  return !Number.isNaN(t) && t <= now.getTime();
}
