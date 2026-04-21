import { describe, expect, it } from "vitest";

import { PatientBalanceServiceImpl, applyDeltaLocally } from "./patient-balance-service.js";

import type { PatientBalanceDataAccess } from "./supabase-data-access.js";
import type {
  AgingBand,
  Insert,
  PatientBalance,
  PatientId,
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
const PATIENT_A = "aaaaaaaa-0000-0000-0000-000000000001" as PatientId;
const PATIENT_B = "bbbbbbbb-0000-0000-0000-000000000001" as PatientId;

function ctx(perms: readonly Permission[] = ["billing:read", "billing:write"]): TenantContext {
  return {
    tenantId: TENANT,
    userId: USER,
    userKind: "staff",
    roles: [],
    permissions: perms,
  };
}

function balance(overrides: Partial<PatientBalance> = {}): PatientBalance {
  return {
    id: "b-1" as PatientBalance["id"],
    tenantId: TENANT,
    patientId: PATIENT_A,
    currentBalanceMinor: 0,
    aging0_30Minor: 0,
    aging31_60Minor: 0,
    aging61_90Minor: 0,
    agingOver90Minor: 0,
    currency: "USD",
    lastPaymentAt: null,
    lastStatementAt: null,
    createdAt: "2026-04-20T00:00:00Z",
    updatedAt: "2026-04-20T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory data access
// ---------------------------------------------------------------------------

class InMemoryData implements PatientBalanceDataAccess {
  public rows = new Map<string, PatientBalance>();
  public chargeSum = new Map<string, number>();
  public paymentSum = new Map<string, number>();

  private key(tenantId: string, patientId: PatientId): string {
    return `${tenantId}|${patientId}`;
  }

  async getByTenantAndPatient(tenantId: string, patientId: PatientId) {
    return this.rows.get(this.key(tenantId, patientId)) ?? null;
  }

  async upsert(row: Insert<"patient_balances">): Promise<PatientBalance> {
    const key = this.key(row.tenant_id, row.patient_id as PatientId);
    const prev = this.rows.get(key);
    const saved: PatientBalance = {
      id: (row.id ?? prev?.id ?? `b-${this.rows.size + 1}`) as PatientBalance["id"],
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
    return [...this.rows.values()];
  }

  async sumChargesForPatient(tenantId: string, patientId: PatientId) {
    return this.chargeSum.get(this.key(tenantId, patientId)) ?? 0;
  }

  async sumPaymentsForPatient(tenantId: string, patientId: PatientId) {
    return this.paymentSum.get(this.key(tenantId, patientId)) ?? 0;
  }
}

function svc() {
  const data = new InMemoryData();
  const service = new PatientBalanceServiceImpl({
    data,
    clock: () => new Date("2026-04-21T10:00:00Z"),
  });
  return { service, data };
}

// ---------------------------------------------------------------------------
// Pure helper — applyDeltaLocally
// ---------------------------------------------------------------------------

describe("applyDeltaLocally", () => {
  it("returns the input unchanged for zero delta", () => {
    const b = balance({ currentBalanceMinor: 10000, aging0_30Minor: 10000 });
    expect(
      applyDeltaLocally(b, {
        patientId: PATIENT_A,
        deltaMinor: 0,
        band: "0-30",
        touchPayment: false,
      }),
    ).toEqual(b);
  });

  it("positive delta lands on 0-30 by default", () => {
    const next = applyDeltaLocally(balance(), {
      patientId: PATIENT_A,
      deltaMinor: 12500,
      band: "0-30",
      touchPayment: false,
    });
    expect(next.currentBalanceMinor).toBe(12500);
    expect(next.aging0_30Minor).toBe(12500);
    expect(next.aging31_60Minor).toBe(0);
  });

  it("positive delta lands on specified band", () => {
    const next = applyDeltaLocally(balance(), {
      patientId: PATIENT_A,
      deltaMinor: 5000,
      band: "over-90",
      touchPayment: false,
    });
    expect(next.currentBalanceMinor).toBe(5000);
    expect(next.agingOver90Minor).toBe(5000);
    expect(next.aging0_30Minor).toBe(0);
  });

  it("negative delta drains over-90 first", () => {
    const prev = balance({
      currentBalanceMinor: 15000,
      aging0_30Minor: 5000,
      aging61_90Minor: 2000,
      agingOver90Minor: 8000,
    });
    const next = applyDeltaLocally(prev, {
      patientId: PATIENT_A,
      deltaMinor: -3000,
      band: "0-30",
      touchPayment: true,
    });
    expect(next.currentBalanceMinor).toBe(12000);
    expect(next.agingOver90Minor).toBe(5000); // drained first
    expect(next.aging61_90Minor).toBe(2000); // untouched
    expect(next.aging0_30Minor).toBe(5000); // untouched
  });

  it("cascades through over-90 → 61-90 → 31-60 → 0-30", () => {
    const prev = balance({
      currentBalanceMinor: 10000,
      aging0_30Minor: 3000,
      aging31_60Minor: 1000,
      aging61_90Minor: 2000,
      agingOver90Minor: 4000,
    });
    const next = applyDeltaLocally(prev, {
      patientId: PATIENT_A,
      deltaMinor: -8000,
      band: "0-30",
      touchPayment: true,
    });
    // drains: 4000 from over-90, 2000 from 61-90, 1000 from 31-60, 1000 from 0-30
    expect(next.agingOver90Minor).toBe(0);
    expect(next.aging61_90Minor).toBe(0);
    expect(next.aging31_60Minor).toBe(0);
    expect(next.aging0_30Minor).toBe(2000);
    expect(next.currentBalanceMinor).toBe(2000);
  });

  it("overpayment pushes 0-30 negative (credit)", () => {
    const prev = balance({ currentBalanceMinor: 10000, aging0_30Minor: 10000 });
    const next = applyDeltaLocally(prev, {
      patientId: PATIENT_A,
      deltaMinor: -15000,
      band: "0-30",
      touchPayment: true,
    });
    expect(next.currentBalanceMinor).toBe(-5000);
    expect(next.aging0_30Minor).toBe(-5000);
    expect(next.aging31_60Minor).toBe(0);
    expect(next.aging61_90Minor).toBe(0);
    expect(next.agingOver90Minor).toBe(0);
  });

  it("aging bucket sum invariant holds after any delta", () => {
    const prev = balance({
      currentBalanceMinor: 10000,
      aging0_30Minor: 3000,
      aging31_60Minor: 1000,
      aging61_90Minor: 2000,
      agingOver90Minor: 4000,
    });
    for (const delta of [-50, -1000, -3000, -9999, 500, 5000, 12345]) {
      const next = applyDeltaLocally(prev, {
        patientId: PATIENT_A,
        deltaMinor: delta,
        band: "0-30",
        touchPayment: false,
      });
      expect(
        next.aging0_30Minor + next.aging31_60Minor + next.aging61_90Minor + next.agingOver90Minor,
      ).toBe(next.currentBalanceMinor);
    }
  });
});

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

describe("permissions", () => {
  it("get requires billing:read", async () => {
    const { service } = svc();
    await expect(service.get(ctx([]), PATIENT_A)).rejects.toThrow(/billing:read/);
  });

  it("list requires billing:read", async () => {
    const { service } = svc();
    await expect(
      service.list(ctx([]), {
        sort: "over90_desc",
        limit: 50,
        offset: 0,
      }),
    ).rejects.toThrow(/billing:read/);
  });

  it("applyDelta requires billing:write", async () => {
    const { service } = svc();
    await expect(
      service.applyDelta(ctx(["billing:read"]), {
        patientId: PATIENT_A,
        deltaMinor: 1000,
        band: "0-30",
        touchPayment: false,
      }),
    ).rejects.toThrow(/billing:write/);
  });

  it("recalculate requires billing:write", async () => {
    const { service } = svc();
    await expect(service.recalculate(ctx(["billing:read"]), PATIENT_A)).rejects.toThrow(
      /billing:write/,
    );
  });
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe("get", () => {
  it("returns a zero balance when no row exists (lazy)", async () => {
    const { service } = svc();
    const b = await service.get(ctx(), PATIENT_A);
    expect(b.currentBalanceMinor).toBe(0);
    expect(b.aging0_30Minor).toBe(0);
    expect(b.patientId).toBe(PATIENT_A);
  });

  it("returns the stored row when present", async () => {
    const { service, data } = svc();
    await data.upsert({
      tenant_id: TENANT,
      patient_id: PATIENT_A as string,
      current_balance_minor: 12500,
      aging_0_30_minor: 12500,
      aging_31_60_minor: 0,
      aging_61_90_minor: 0,
      aging_over_90_minor: 0,
      currency: "USD",
    });
    const b = await service.get(ctx(), PATIENT_A);
    expect(b.currentBalanceMinor).toBe(12500);
  });
});

// ---------------------------------------------------------------------------
// applyDelta
// ---------------------------------------------------------------------------

describe("applyDelta", () => {
  it("lazy-creates a row on first positive delta", async () => {
    const { service, data } = svc();
    const result = await service.applyDelta(ctx(), {
      patientId: PATIENT_A,
      deltaMinor: 12500,
      band: "0-30",
      touchPayment: false,
    });
    expect(result.currentBalanceMinor).toBe(12500);
    expect(data.rows.size).toBe(1);
  });

  it("increments an existing row", async () => {
    const { service, data } = svc();
    await service.applyDelta(ctx(), {
      patientId: PATIENT_A,
      deltaMinor: 12500,
      band: "0-30",
      touchPayment: false,
    });
    const next = await service.applyDelta(ctx(), {
      patientId: PATIENT_A,
      deltaMinor: 5000,
      band: "0-30",
      touchPayment: false,
    });
    expect(next.currentBalanceMinor).toBe(17500);
    expect(data.rows.size).toBe(1);
  });

  it("sets last_payment_at when touchPayment=true", async () => {
    const { service, data } = svc();
    await service.applyDelta(ctx(), {
      patientId: PATIENT_A,
      deltaMinor: 10000,
      band: "0-30",
      touchPayment: false,
    });
    await service.applyDelta(ctx(), {
      patientId: PATIENT_A,
      deltaMinor: -3000,
      band: "0-30",
      touchPayment: true,
    });
    const stored = data.rows.values().next().value!;
    expect(stored.lastPaymentAt).toBe("2026-04-21T10:00:00.000Z");
  });

  it("isolates tenants + patients", async () => {
    const { service, data } = svc();
    await service.applyDelta(ctx(), {
      patientId: PATIENT_A,
      deltaMinor: 1000,
      band: "0-30",
      touchPayment: false,
    });
    await service.applyDelta(ctx(), {
      patientId: PATIENT_B,
      deltaMinor: 2000,
      band: "0-30",
      touchPayment: false,
    });
    expect(data.rows.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// recalculate
// ---------------------------------------------------------------------------

describe("recalculate", () => {
  it("computes current as charges − payments and drops to 0-30", async () => {
    const { service, data } = svc();
    data.chargeSum.set(`${TENANT}|${PATIENT_A}`, 50000);
    data.paymentSum.set(`${TENANT}|${PATIENT_A}`, 20000);
    const result = await service.recalculate(ctx(), PATIENT_A);
    expect(result.currentBalanceMinor).toBe(30000);
    expect(result.aging0_30Minor).toBe(30000);
    expect(result.aging31_60Minor).toBe(0);
  });

  it("handles negative (overpayment) on recalculate", async () => {
    const { service, data } = svc();
    data.chargeSum.set(`${TENANT}|${PATIENT_A}`, 5000);
    data.paymentSum.set(`${TENANT}|${PATIENT_A}`, 8000);
    const result = await service.recalculate(ctx(), PATIENT_A);
    expect(result.currentBalanceMinor).toBe(-3000);
    expect(result.aging0_30Minor).toBe(-3000);
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("list", () => {
  it("forwards all filter params to the data layer", async () => {
    const { service, data } = svc();
    await data.upsert({
      tenant_id: TENANT,
      patient_id: PATIENT_A as string,
      current_balance_minor: 15000,
      aging_0_30_minor: 5000,
      aging_31_60_minor: 0,
      aging_61_90_minor: 0,
      aging_over_90_minor: 10000,
      currency: "USD",
    });
    const result = await service.list(ctx(), {
      band: "over-90" as AgingBand,
      sort: "over90_desc",
      limit: 10,
      offset: 0,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.agingOver90Minor).toBe(10000);
  });

  it("omitting band lists all rows", async () => {
    const { service, data } = svc();
    await data.upsert({
      tenant_id: TENANT,
      patient_id: PATIENT_A as string,
      current_balance_minor: 100,
      aging_0_30_minor: 100,
      aging_31_60_minor: 0,
      aging_61_90_minor: 0,
      aging_over_90_minor: 0,
      currency: "USD",
    });
    const result = await service.list(ctx(), {
      sort: "current_desc",
      limit: 50,
      offset: 0,
    });
    expect(result).toHaveLength(1);
  });
});
