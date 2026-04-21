import { describe, expect, it } from "vitest";

import { ClaimServiceImpl } from "./claim-service.js";

import type { ClaimBundle, ClaimDataAccess } from "./supabase-data-access.js";
import type {
  ChargeId,
  ClaimId,
  ClaimLineId,
  Insert,
  PatientCoverageId,
  PatientId,
  PayerId,
  Permission,
  Row,
  TenantContext,
  TenantId,
  Update,
  UserId,
} from "@vitalflow/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT = "00000000-0000-0000-0000-000000000001" as TenantId;
const USER = "00000000-0000-0000-0000-000000000002" as UserId;
const OTHER = "00000000-0000-0000-0000-000000000099" as UserId;
const PATIENT = "aaaaaaaa-0000-0000-0000-000000000001" as PatientId;
const PATIENT_2 = "bbbbbbbb-0000-0000-0000-000000000001" as PatientId;
const PAYER = "dddddddd-0000-0000-0000-000000000001" as PayerId;
const COVERAGE = "eeeeeeee-0000-0000-0000-000000000001" as PatientCoverageId;
const CHARGE_1 = "11111111-1111-4111-8111-111111111111" as ChargeId;
const CHARGE_2 = "22222222-2222-4222-8222-222222222222" as ChargeId;

function ctx(
  perms: readonly Permission[] = ["billing:read", "billing:write"],
  impersonating = false,
): TenantContext {
  return {
    tenantId: TENANT,
    userId: USER,
    userKind: "staff",
    roles: [],
    permissions: perms,
    ...(impersonating
      ? {
          impersonation: {
            sessionId: "imp-1",
            impersonatorId: OTHER,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }
      : {}),
  };
}

function chargeRow(overrides: Partial<Row<"charges">> = {}): Row<"charges"> {
  const units = overrides.units ?? 1;
  const unit_price_minor = overrides.unit_price_minor ?? 12500;
  return {
    id: CHARGE_1 as string,
    tenant_id: TENANT,
    patient_id: PATIENT as string,
    encounter_id: null,
    order_id: null,
    cpt_code: "99213",
    hcpcs_code: null,
    revenue_code: null,
    icd10_codes: ["J02.9"],
    modifiers: [],
    units,
    unit_price_minor,
    total_minor: units * unit_price_minor,
    currency: "USD",
    service_date: "2026-04-20",
    posted_at: "2026-04-20T14:00:00Z",
    posted_by: USER,
    status: "posted",
    notes: null,
    metadata: {},
    created_at: "2026-04-20T14:00:00Z",
    updated_at: "2026-04-20T14:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory data access
// ---------------------------------------------------------------------------

class InMemoryClaimData implements ClaimDataAccess {
  public claims: Map<string, Row<"claims">> = new Map();
  public lines: Map<string, Row<"claim_lines">> = new Map();
  public history: Row<"claim_status_history">[] = [];
  public charges: Map<string, Row<"charges">> = new Map();

  async list() {
    return [...this.claims.values()];
  }

  async getBundle(_t: string, id: string): Promise<ClaimBundle | null> {
    const c = this.claims.get(id);
    if (!c) return null;
    const patient = { id: c.patient_id, given_name: "Jane", family_name: "Doe" };
    const payer = { id: c.payer_id, name: "Demo Payer" };
    const lines = [...this.lines.values()].filter((l) => l.claim_id === id);
    const history = this.history.filter((h) => h.claim_id === id);
    return {
      claim: { ...c, patient, payer } as ClaimBundle["claim"],
      lines,
      history,
    };
  }

  async getStatus(_t: string, id: string) {
    const row = this.claims.get(id);
    return row ? (row.status as Row<"claims">["status"]) : null;
  }

  async insertClaimWithLines(params: {
    claim: Insert<"claims">;
    lines: readonly Insert<"claim_lines">[];
  }): Promise<ClaimBundle> {
    const now = new Date().toISOString();
    const claim: Row<"claims"> = {
      id: params.claim.id ?? `c-${this.claims.size + 1}`,
      tenant_id: params.claim.tenant_id,
      patient_id: params.claim.patient_id,
      payer_id: params.claim.payer_id,
      coverage_id: params.claim.coverage_id ?? null,
      number: params.claim.number ?? `CLM-${this.claims.size + 1}`,
      status: (params.claim.status as Row<"claims">["status"]) ?? "draft",
      billing_provider_id: params.claim.billing_provider_id ?? null,
      rendering_provider_id: params.claim.rendering_provider_id ?? null,
      service_start_date: params.claim.service_start_date,
      service_end_date: params.claim.service_end_date,
      total_minor: params.claim.total_minor ?? 0,
      allowed_minor: params.claim.allowed_minor ?? null,
      paid_minor: params.claim.paid_minor ?? 0,
      patient_resp_minor: params.claim.patient_resp_minor ?? 0,
      currency: params.claim.currency ?? "USD",
      submitted_at: params.claim.submitted_at ?? null,
      adjudicated_at: params.claim.adjudicated_at ?? null,
      external_claim_id: params.claim.external_claim_id ?? null,
      edi_envelope: params.claim.edi_envelope ?? null,
      metadata: params.claim.metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    this.claims.set(claim.id, claim);

    const savedLines: Row<"claim_lines">[] = [];
    params.lines.forEach((l, i) => {
      const row: Row<"claim_lines"> = {
        id: `cl-${this.lines.size + i + 1}`,
        tenant_id: l.tenant_id,
        claim_id: claim.id,
        charge_id: l.charge_id ?? null,
        line_number: l.line_number ?? i + 1,
        cpt_code: l.cpt_code ?? null,
        modifiers: l.modifiers ?? [],
        icd10_codes: l.icd10_codes ?? [],
        units: l.units ?? 1,
        charge_minor: l.charge_minor ?? 0,
        allowed_minor: l.allowed_minor ?? null,
        paid_minor: l.paid_minor ?? 0,
        adjustment_minor: l.adjustment_minor ?? 0,
        denial_codes: l.denial_codes ?? [],
        currency: l.currency ?? "USD",
        service_date: l.service_date,
        created_at: now,
      };
      this.lines.set(row.id, row);
      savedLines.push(row);
    });

    const patient = { id: claim.patient_id, given_name: "Jane", family_name: "Doe" };
    const payer = { id: claim.payer_id, name: "Demo Payer" };
    return {
      claim: { ...claim, patient, payer } as ClaimBundle["claim"],
      lines: savedLines,
      history: [],
    };
  }

  async updateStatus(_t: string, id: string, patch: Update<"claims">) {
    const prev = this.claims.get(id)!;
    const next: Row<"claims"> = {
      ...prev,
      ...(patch.status !== undefined ? { status: patch.status as Row<"claims">["status"] } : {}),
      updated_at: new Date().toISOString(),
    };
    this.claims.set(id, next);
    return next;
  }

  async insertHistory(row: Insert<"claim_status_history">) {
    this.history.push({
      id: `h-${this.history.length + 1}`,
      tenant_id: row.tenant_id,
      claim_id: row.claim_id,
      from_status: row.from_status ?? null,
      to_status: row.to_status,
      occurred_at: row.occurred_at ?? new Date().toISOString(),
      actor_id: row.actor_id ?? null,
      message: row.message ?? null,
      payload: row.payload ?? {},
    } as Row<"claim_status_history">);
  }

  async getChargesForClaim(_t: string, ids: readonly string[]) {
    return ids.map((id) => this.charges.get(id)).filter((c): c is Row<"charges"> => !!c);
  }

  async markChargesBilled(_t: string, ids: readonly string[]) {
    for (const id of ids) {
      const c = this.charges.get(id);
      if (c) this.charges.set(id, { ...c, status: "billed" });
    }
  }
}

function svc() {
  const data = new InMemoryClaimData();
  const service = new ClaimServiceImpl({
    data,
    clock: () => new Date("2026-04-21T12:00:00Z"),
    claimNumberer: () => "CLM-2026-000001",
  });
  return { service, data };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

describe("permissions", () => {
  it("list requires billing:read", async () => {
    const { service } = svc();
    await expect(service.list(ctx([]), { limit: 50, offset: 0 })).rejects.toThrow(/billing:read/);
  });

  it("createFromCharges requires billing:write", async () => {
    const { service } = svc();
    await expect(
      service.createFromCharges(ctx(["billing:read"]), {
        payerId: PAYER,
        chargeIds: [CHARGE_1],
      }),
    ).rejects.toThrow(/billing:write/);
  });

  it("createFromCharges refuses while impersonating", async () => {
    const { service, data } = svc();
    data.charges.set(CHARGE_1 as string, chargeRow());
    await expect(
      service.createFromCharges(ctx(["billing:read", "billing:write"], true), {
        payerId: PAYER,
        chargeIds: [CHARGE_1],
      }),
    ).rejects.toThrow(/impersonat/i);
  });
});

// ---------------------------------------------------------------------------
// createFromCharges
// ---------------------------------------------------------------------------

describe("createFromCharges", () => {
  it("creates a claim + lines from posted charges", async () => {
    const { service, data } = svc();
    data.charges.set(CHARGE_1 as string, chargeRow({ id: CHARGE_1 as string }));
    data.charges.set(
      CHARGE_2 as string,
      chargeRow({
        id: CHARGE_2 as string,
        cpt_code: "87430",
        unit_price_minor: 4500,
        total_minor: 4500,
        service_date: "2026-04-20",
      }),
    );

    const bundle = await service.createFromCharges(ctx(), {
      payerId: PAYER,
      coverageId: COVERAGE,
      chargeIds: [CHARGE_1, CHARGE_2],
    });

    expect(bundle.claim.status).toBe("draft");
    expect(bundle.claim.totalMinor).toBe(17000);
    expect(bundle.lines).toHaveLength(2);
    expect(bundle.lines[0]!.cptCode).toBe("99213");
    // History row created:
    expect(data.history).toHaveLength(1);
    expect(data.history[0]!.to_status).toBe("draft");
  });

  it("refuses when any charge isn't posted", async () => {
    const { service, data } = svc();
    data.charges.set(CHARGE_1 as string, chargeRow({ id: CHARGE_1 as string }));
    data.charges.set(CHARGE_2 as string, chargeRow({ id: CHARGE_2 as string, status: "draft" }));
    await expect(
      service.createFromCharges(ctx(), {
        payerId: PAYER,
        chargeIds: [CHARGE_1, CHARGE_2],
      }),
    ).rejects.toThrow(/posted/);
  });

  it("refuses when charges span multiple patients", async () => {
    const { service, data } = svc();
    data.charges.set(
      CHARGE_1 as string,
      chargeRow({ id: CHARGE_1 as string, patient_id: PATIENT }),
    );
    data.charges.set(
      CHARGE_2 as string,
      chargeRow({ id: CHARGE_2 as string, patient_id: PATIENT_2 }),
    );
    await expect(
      service.createFromCharges(ctx(), {
        payerId: PAYER,
        chargeIds: [CHARGE_1, CHARGE_2],
      }),
    ).rejects.toThrow(/same patient/);
  });

  it("refuses when a charge id doesn't resolve", async () => {
    const { service, data } = svc();
    data.charges.set(CHARGE_1 as string, chargeRow({ id: CHARGE_1 as string }));
    await expect(
      service.createFromCharges(ctx(), {
        payerId: PAYER,
        chargeIds: [CHARGE_1, CHARGE_2],
      }),
    ).rejects.toThrow(/not found|another tenant/);
  });
});

// ---------------------------------------------------------------------------
// markReady / appeal / close
// ---------------------------------------------------------------------------

describe("state transitions", () => {
  async function seedClaim(data: InMemoryClaimData, status: Row<"claims">["status"]) {
    const bundle = await data.insertClaimWithLines({
      claim: {
        id: "c-seed",
        tenant_id: TENANT,
        patient_id: PATIENT,
        payer_id: PAYER,
        number: "CLM-SEED",
        status,
        service_start_date: "2026-04-20",
        service_end_date: "2026-04-20",
        total_minor: 10000,
      },
      lines: [],
    });
    return bundle.claim.id;
  }

  it("markReady: draft → ready + history row + audit event", async () => {
    const { service, data } = svc();
    const id = await seedClaim(data, "draft");
    const next = await service.markReady(ctx(), id as ClaimId);
    expect(next.status).toBe("ready");
    expect(data.history.some((h) => h.from_status === "draft" && h.to_status === "ready")).toBe(
      true,
    );
  });

  it("markReady refuses non-draft", async () => {
    const { service, data } = svc();
    const id = await seedClaim(data, "submitted");
    await expect(service.markReady(ctx(), id as ClaimId)).rejects.toThrow(/submitted/);
  });

  it("appeal transitions denied → appealed", async () => {
    const { service, data } = svc();
    const id = await seedClaim(data, "denied");
    const next = await service.appeal(ctx(), id as ClaimId, {
      reason: "Attached requested documentation",
      supportingDocs: [],
    });
    expect(next.status).toBe("appealed");
  });

  it("appeal refuses in draft", async () => {
    const { service, data } = svc();
    const id = await seedClaim(data, "draft");
    await expect(
      service.appeal(ctx(), id as ClaimId, {
        reason: "can't appeal a draft",
        supportingDocs: [],
      }),
    ).rejects.toThrow(/draft/);
  });

  it("close transitions any non-closed → closed", async () => {
    const { service, data } = svc();
    const id = await seedClaim(data, "paid");
    const next = await service.close(ctx(), id as ClaimId, { reason: "balance cleared, closing" });
    expect(next.status).toBe("closed");
  });

  it("close refuses already-closed", async () => {
    const { service, data } = svc();
    const id = await seedClaim(data, "closed");
    await expect(
      service.close(ctx(), id as ClaimId, { reason: "attempting close again" }),
    ).rejects.toThrow(/closed/);
  });
});

// ---------------------------------------------------------------------------
// submit + applyRemittance (clearinghouse stubs)
// ---------------------------------------------------------------------------

describe("clearinghouse-bound actions", () => {
  it("submit throws INTEGRATION_NOT_CONFIGURED when no clearinghouse dep", async () => {
    const { service, data } = svc();
    const bundle = await data.insertClaimWithLines({
      claim: {
        id: "c-ready",
        tenant_id: TENANT,
        patient_id: PATIENT,
        payer_id: PAYER,
        number: "CLM-READY",
        status: "ready",
        service_start_date: "2026-04-20",
        service_end_date: "2026-04-20",
        total_minor: 10000,
      },
      lines: [],
    });
    await expect(service.submit(ctx(), bundle.claim.id as ClaimId)).rejects.toMatchObject({
      code: "INTEGRATION_NOT_CONFIGURED",
    });
  });

  it("applyRemittance throws INTEGRATION_NOT_CONFIGURED", async () => {
    const { service } = svc();
    await expect(
      service.applyRemittance(ctx(), "33333333-3333-4333-8333-333333333333" as ClaimId, {
        adjudicatedAt: "2026-04-21T00:00:00Z",
        patientRespMinor: 0,
        lines: [
          {
            claimLineId: "44444444-4444-4444-8444-444444444444" as ClaimLineId,
            allowedMinor: 0,
            paidMinor: 0,
            adjustmentMinor: 0,
            denialCodes: [],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED" });
  });
});

// ---------------------------------------------------------------------------
// list + getById
// ---------------------------------------------------------------------------

describe("list + getById", () => {
  it("list returns all claims", async () => {
    const { service, data } = svc();
    await data.insertClaimWithLines({
      claim: {
        tenant_id: TENANT,
        patient_id: PATIENT,
        payer_id: PAYER,
        number: "CLM-1",
        status: "draft",
        service_start_date: "2026-04-20",
        service_end_date: "2026-04-20",
      },
      lines: [],
    });
    const rows = await service.list(ctx(), { limit: 50, offset: 0 });
    expect(rows).toHaveLength(1);
  });

  it("getById returns bundle with lines + history", async () => {
    const { service, data } = svc();
    const bundle = await data.insertClaimWithLines({
      claim: {
        tenant_id: TENANT,
        patient_id: PATIENT,
        payer_id: PAYER,
        number: "CLM-G",
        status: "submitted",
        service_start_date: "2026-04-20",
        service_end_date: "2026-04-20",
      },
      lines: [],
    });
    data.history.push({
      id: "h-1",
      tenant_id: TENANT,
      claim_id: bundle.claim.id,
      from_status: "draft",
      to_status: "submitted",
      occurred_at: "2026-04-21T10:00:00Z",
      actor_id: USER,
      message: null,
      payload: {},
    } as Row<"claim_status_history">);

    const got = await service.getById(ctx(), bundle.claim.id as ClaimId);
    expect(got?.claim.status).toBe("submitted");
    expect(got?.history).toHaveLength(1);
  });

  it("getById returns null for missing claim", async () => {
    const { service } = svc();
    const got = await service.getById(ctx(), "99999999-9999-4999-8999-999999999999" as ClaimId);
    expect(got).toBeNull();
  });
});
