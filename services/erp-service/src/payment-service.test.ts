import { describe, expect, it } from "vitest";

import { PatientBalanceServiceImpl } from "./patient-balance-service.js";
import { PaymentServiceImpl } from "./payment-service.js";

import type { PatientBalanceDataAccess, PaymentDataAccess } from "./supabase-data-access.js";
import type {
  Insert,
  InvoiceId,
  PatientBalance,
  PatientId,
  Payment,
  PaymentId,
  PayerId,
  Permission,
  TenantContext,
  TenantId,
  UserId,
} from "@vitalflow/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT = "00000000-0000-0000-0000-000000000001" as TenantId;
const USER = "00000000-0000-0000-0000-000000000002" as UserId;
const PATIENT = "aaaaaaaa-0000-0000-0000-000000000001" as PatientId;
const PAYER = "bbbbbbbb-0000-0000-0000-000000000001" as PayerId;
const INVOICE = "cccccccc-0000-0000-0000-000000000001" as InvoiceId;

function ctx(
  perms: readonly Permission[] = [
    "billing:read",
    "billing:collect",
    "billing:adjust",
    "billing:write",
  ],
): TenantContext {
  return {
    tenantId: TENANT,
    userId: USER,
    userKind: "staff",
    roles: [],
    permissions: perms,
  };
}

// ---------------------------------------------------------------------------
// In-memory data access
// ---------------------------------------------------------------------------

class InMemoryPaymentData implements PaymentDataAccess {
  public rows: Map<string, Payment> = new Map();

  async insert(row: Insert<"payments">) {
    const id = `p-${this.rows.size + 1}`.padEnd(36, "0");
    const saved: Payment = {
      id: id as PaymentId,
      tenantId: row.tenant_id as TenantId,
      invoiceId: (row.invoice_id ?? null) as InvoiceId | null,
      patientId: (row.patient_id ?? null) as PatientId | null,
      payerId: (row.payer_id ?? null) as PayerId | null,
      method: row.method,
      amountMinor: row.amount_minor,
      currency: row.currency ?? "USD",
      receivedAt: row.received_at ?? new Date().toISOString(),
      reference: row.reference ?? null,
      processor: row.processor ?? null,
      processorRef: row.processor_ref ?? null,
      notes: row.notes ?? null,
      createdAt: new Date().toISOString(),
    };
    this.rows.set(id, saved);
    return saved;
  }

  async getById(_tenantId: string, id: string) {
    return this.rows.get(id) ?? null;
  }

  async list() {
    return [...this.rows.values()];
  }

  async totalPaidForInvoice(_tenantId: string, invoiceId: string) {
    return [...this.rows.values()]
      .filter((r) => r.invoiceId === invoiceId)
      .reduce((s, r) => s + r.amountMinor, 0);
  }
}

class InMemoryBalanceData implements PatientBalanceDataAccess {
  public rows = new Map<string, PatientBalance>();
  private key(t: string, p: PatientId) {
    return `${t}|${p}`;
  }
  async getByTenantAndPatient(t: string, p: PatientId) {
    return this.rows.get(this.key(t, p)) ?? null;
  }
  async upsert(row: Insert<"patient_balances">) {
    const key = this.key(row.tenant_id, row.patient_id as PatientId);
    const prev = this.rows.get(key);
    const saved: PatientBalance = {
      id: (prev?.id ?? `b-${this.rows.size + 1}`) as PatientBalance["id"],
      tenantId: row.tenant_id as TenantId,
      patientId: row.patient_id as PatientId,
      currentBalanceMinor: row.current_balance_minor ?? 0,
      aging0_30Minor: row.aging_0_30_minor ?? 0,
      aging31_60Minor: row.aging_31_60_minor ?? 0,
      aging61_90Minor: row.aging_61_90_minor ?? 0,
      agingOver90Minor: row.aging_over_90_minor ?? 0,
      currency: row.currency ?? "USD",
      lastPaymentAt: row.last_payment_at ?? null,
      lastStatementAt: row.last_statement_at ?? null,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(key, saved);
    return saved;
  }
  async list() {
    return [];
  }
  async sumChargesForPatient() {
    return 0;
  }
  async sumPaymentsForPatient() {
    return 0;
  }
}

function svc() {
  const paymentData = new InMemoryPaymentData();
  const balanceData = new InMemoryBalanceData();
  const balances = new PatientBalanceServiceImpl({
    data: balanceData,
    clock: () => new Date("2026-04-21T10:00:00Z"),
  });
  const service = new PaymentServiceImpl({
    data: paymentData,
    balances,
    clock: () => new Date("2026-04-21T10:00:00Z"),
  });
  return { service, paymentData, balanceData, balances };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

describe("permissions", () => {
  it("list requires billing:read", async () => {
    const { service } = svc();
    await expect(service.list(ctx([]), { limit: 50, offset: 0 })).rejects.toThrow(/billing:read/);
  });

  it("record requires billing:collect", async () => {
    const { service } = svc();
    await expect(
      service.record(ctx(["billing:read"]), {
        patientId: PATIENT,
        method: "card",
        amountMinor: 10000,
        currency: "USD",
        receivedAt: "2026-04-21T09:00:00Z",
      }),
    ).rejects.toThrow(/billing:collect/);
  });

  it("refund requires billing:adjust", async () => {
    const { service, paymentData } = svc();
    await paymentData.insert({
      tenant_id: TENANT,
      patient_id: PATIENT,
      method: "card",
      amount_minor: 10000,
      currency: "USD",
      received_at: "2026-04-21T09:00:00Z",
    });
    const pid = [...paymentData.rows.keys()][0]!;
    await expect(
      service.refund(ctx(["billing:read", "billing:collect"]), pid as PaymentId, {
        amountMinor: 1000,
        reason: "duplicate charge",
      }),
    ).rejects.toThrow(/billing:adjust/);
  });
});

// ---------------------------------------------------------------------------
// record
// ---------------------------------------------------------------------------

describe("record", () => {
  it("patient card payment updates A/R via balances.applyDelta", async () => {
    const { service, balanceData } = svc();
    // Seed a balance first so we can see the delta effect.
    await balanceData.upsert({
      tenant_id: TENANT,
      patient_id: PATIENT as string,
      current_balance_minor: 12500,
      aging_0_30_minor: 12500,
      aging_31_60_minor: 0,
      aging_61_90_minor: 0,
      aging_over_90_minor: 0,
      currency: "USD",
    });

    await service.record(ctx(), {
      patientId: PATIENT,
      method: "card",
      amountMinor: 10000,
      currency: "USD",
      receivedAt: "2026-04-21T09:00:00Z",
    });

    const bal = balanceData.rows.values().next().value!;
    expect(bal.currentBalanceMinor).toBe(2500);
    expect(bal.aging0_30Minor).toBe(2500);
    expect(bal.lastPaymentAt).toBe("2026-04-21T10:00:00.000Z");
  });

  it("insurance payment does NOT touch patient_balances", async () => {
    const { service, balanceData } = svc();
    await balanceData.upsert({
      tenant_id: TENANT,
      patient_id: PATIENT as string,
      current_balance_minor: 12500,
      aging_0_30_minor: 12500,
      aging_31_60_minor: 0,
      aging_61_90_minor: 0,
      aging_over_90_minor: 0,
      currency: "USD",
    });

    await service.record(ctx(), {
      payerId: PAYER,
      method: "insurance",
      amountMinor: 8000,
      currency: "USD",
      receivedAt: "2026-04-21T09:00:00Z",
      invoiceId: INVOICE,
    });

    // Balance unchanged by insurance posting.
    const bal = balanceData.rows.values().next().value!;
    expect(bal.currentBalanceMinor).toBe(12500);
  });

  it("rejects patient+payer both set (Zod refinement)", async () => {
    const { service } = svc();
    await expect(
      service.record(ctx(), {
        patientId: PATIENT,
        payerId: PAYER,
        method: "card",
        amountMinor: 100,
        currency: "USD",
        receivedAt: "2026-04-21T09:00:00Z",
      }),
    ).rejects.toThrow();
  });

  it("rejects method=insurance without payerId", async () => {
    const { service } = svc();
    await expect(
      service.record(ctx(), {
        patientId: PATIENT,
        method: "insurance",
        amountMinor: 100,
        currency: "USD",
        receivedAt: "2026-04-21T09:00:00Z",
      }),
    ).rejects.toThrow();
  });

  it("rejects method=card without patientId", async () => {
    const { service } = svc();
    await expect(
      service.record(ctx(), {
        payerId: PAYER,
        method: "card",
        amountMinor: 100,
        currency: "USD",
        receivedAt: "2026-04-21T09:00:00Z",
      }),
    ).rejects.toThrow();
  });

  it("rejects amount == 0", async () => {
    const { service } = svc();
    await expect(
      service.record(ctx(), {
        patientId: PATIENT,
        method: "card",
        amountMinor: 0,
        currency: "USD",
        receivedAt: "2026-04-21T09:00:00Z",
      }),
    ).rejects.toThrow();
  });

  it("rejects future receivedAt", async () => {
    const { service } = svc();
    await expect(
      service.record(ctx(), {
        patientId: PATIENT,
        method: "card",
        amountMinor: 1000,
        currency: "USD",
        receivedAt: "2026-12-31T00:00:00Z",
      }),
    ).rejects.toThrow(/future/);
  });

  it("allows overpayment (balance goes negative = credit)", async () => {
    const { service, balanceData } = svc();
    await balanceData.upsert({
      tenant_id: TENANT,
      patient_id: PATIENT as string,
      current_balance_minor: 5000,
      aging_0_30_minor: 5000,
      aging_31_60_minor: 0,
      aging_61_90_minor: 0,
      aging_over_90_minor: 0,
      currency: "USD",
    });
    await service.record(ctx(), {
      patientId: PATIENT,
      method: "cash",
      amountMinor: 8000,
      currency: "USD",
      receivedAt: "2026-04-21T09:00:00Z",
    });
    const bal = balanceData.rows.values().next().value!;
    expect(bal.currentBalanceMinor).toBe(-3000);
    expect(bal.aging0_30Minor).toBe(-3000);
  });
});

// ---------------------------------------------------------------------------
// refund
// ---------------------------------------------------------------------------

describe("refund", () => {
  async function recordPatientPayment() {
    const env = svc();
    await env.balanceData.upsert({
      tenant_id: TENANT,
      patient_id: PATIENT as string,
      current_balance_minor: 12500,
      aging_0_30_minor: 12500,
      aging_31_60_minor: 0,
      aging_61_90_minor: 0,
      aging_over_90_minor: 0,
      currency: "USD",
    });
    const created = await env.service.record(ctx(), {
      patientId: PATIENT,
      method: "card",
      amountMinor: 10000,
      currency: "USD",
      receivedAt: "2026-04-21T09:00:00Z",
    });
    return { ...env, created };
  }

  it("creates a negative-amount payment with REFUND note; original untouched", async () => {
    const { service, paymentData, created } = await recordPatientPayment();
    const refund = await service.refund(ctx(), created.id, {
      amountMinor: 3000,
      reason: "billed wrong units",
    });
    expect(refund.amountMinor).toBe(-3000);
    expect(refund.notes).toMatch(/^REFUND of /);
    // Original still present with its original amount.
    const original = paymentData.rows.get(created.id as string);
    expect(original!.amountMinor).toBe(10000);
  });

  it("reverses the A/R impact on refund (balance goes back up)", async () => {
    const { service, balanceData, created } = await recordPatientPayment();
    // After record, balance was 12500 - 10000 = 2500.
    await service.refund(ctx(), created.id, {
      amountMinor: 3000,
      reason: "overcollect",
    });
    const bal = balanceData.rows.values().next().value!;
    expect(bal.currentBalanceMinor).toBe(5500); // 2500 + 3000 refunded back
  });

  it("refuses refund > original amount", async () => {
    const { service, created } = await recordPatientPayment();
    await expect(
      service.refund(ctx(), created.id, {
        amountMinor: 15000,
        reason: "exceeds",
      }),
    ).rejects.toThrow(/exceeds/);
  });

  it("refuses refund of a refund (negative-amount original)", async () => {
    const { service, created } = await recordPatientPayment();
    const firstRefund = await service.refund(ctx(), created.id, {
      amountMinor: 3000,
      reason: "first refund",
    });
    await expect(
      service.refund(ctx(), firstRefund.id, {
        amountMinor: 500,
        reason: "try refunding a refund",
      }),
    ).rejects.toThrow(/refund a refund/);
  });

  it("404 on unknown payment id", async () => {
    const { service } = svc();
    await expect(
      service.refund(ctx(), "99999999-9999-4999-8999-999999999999" as PaymentId, {
        amountMinor: 100,
        reason: "unknown id test",
      }),
    ).rejects.toThrow(/not found/);
  });

  it("insurance payment refund does NOT touch patient_balances", async () => {
    const { service, balanceData, paymentData } = svc();
    await balanceData.upsert({
      tenant_id: TENANT,
      patient_id: PATIENT as string,
      current_balance_minor: 5000,
      aging_0_30_minor: 5000,
      aging_31_60_minor: 0,
      aging_61_90_minor: 0,
      aging_over_90_minor: 0,
      currency: "USD",
    });
    const insurance = await service.record(ctx(), {
      payerId: PAYER,
      method: "insurance",
      amountMinor: 3000,
      currency: "USD",
      receivedAt: "2026-04-21T09:00:00Z",
      invoiceId: INVOICE,
    });
    await service.refund(ctx(), insurance.id, {
      amountMinor: 1000,
      reason: "payer overpaid",
    });
    // Balance unchanged throughout both steps.
    const bal = balanceData.rows.values().next().value!;
    expect(bal.currentBalanceMinor).toBe(5000);
    // Both rows exist.
    expect(paymentData.rows.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("list", () => {
  it("passes filters through to the data layer", async () => {
    const { service, paymentData } = svc();
    await paymentData.insert({
      tenant_id: TENANT,
      patient_id: PATIENT as string,
      method: "card",
      amount_minor: 1000,
      currency: "USD",
      received_at: "2026-04-21T08:00:00Z",
    });
    const result = await service.list(ctx(), {
      patientId: PATIENT,
      limit: 50,
      offset: 0,
    });
    expect(result).toHaveLength(1);
  });
});
