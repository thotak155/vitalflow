import { describe, expect, it } from "vitest";

import {
  ChargeError,
  ChargeServiceImpl,
  assertCptXorHcpcs,
  assertServiceDateNotFuture,
  rollup,
  type ChargeDataAccess,
  type ChargeLineInsertRow,
  type ChargeLineUpdatePatch,
} from "./charge-service.js";

import type {
  ChargeId,
  ChargeLine,
  CreateChargeLineInput,
  EncounterId,
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
const ENCOUNTER = "10000000-0000-0000-0000-000000000001" as EncounterId;
const PATIENT = "20000000-0000-0000-0000-000000000001" as PatientId;

function ctx(opts: { perms?: readonly Permission[]; impersonating?: boolean } = {}): TenantContext {
  return {
    tenantId: TENANT,
    userId: USER,
    userKind: "staff",
    roles: [],
    permissions: opts.perms ?? ["charges:capture"],
    ...(opts.impersonating
      ? {
          impersonation: {
            sessionId: "imp-1",
            impersonatorId: "00000000-0000-0000-0000-000000000099" as UserId,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }
      : {}),
  };
}

function line(overrides: Partial<ChargeLine> = {}): ChargeLine {
  const units = overrides.units ?? 1;
  const unitPriceMinor = overrides.unitPriceMinor ?? 12500;
  const total = units * unitPriceMinor;
  return {
    id: "30000000-0000-0000-0000-000000000001" as ChargeId,
    tenantId: TENANT,
    patientId: PATIENT,
    encounterId: ENCOUNTER,
    cptCode: "99213",
    hcpcsCode: null,
    revenueCode: null,
    icd10Codes: ["J02.9"],
    modifiers: [],
    units,
    unitPriceMinor,
    totalMinor: total,
    currency: "USD",
    serviceDate: "2026-04-20",
    postedAt: null,
    postedBy: null,
    status: "draft",
    notes: null,
    metadata: {},
    createdAt: "2026-04-20T10:00:00Z",
    updatedAt: "2026-04-20T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory mock data access
// ---------------------------------------------------------------------------

class InMemoryData implements ChargeDataAccess {
  public rows: ChargeLine[] = [];
  public onSubmittedClaim: Set<string> = new Set();
  public encounterDx: Map<string, string[]> = new Map();

  async listByEncounter(tenantId: string, encounterId: EncounterId) {
    return this.rows.filter((r) => r.tenantId === tenantId && r.encounterId === encounterId);
  }
  async getById(tenantId: string, id: ChargeId) {
    return this.rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null;
  }
  async insert(row: ChargeLineInsertRow) {
    const id = `i-${this.rows.length + 1}`.padEnd(36, "0");
    const created: ChargeLine = {
      id: id as ChargeId,
      tenantId: row.tenantId as TenantId,
      patientId: row.patientId as PatientId,
      encounterId: row.encounterId as EncounterId | null,
      orderId: row.orderId ?? null,
      cptCode: row.cptCode ?? null,
      hcpcsCode: row.hcpcsCode ?? null,
      revenueCode: row.revenueCode ?? null,
      icd10Codes: [...row.icd10Codes],
      modifiers: [...row.modifiers],
      units: row.units,
      unitPriceMinor: row.unitPriceMinor,
      totalMinor: row.units * row.unitPriceMinor,
      currency: row.currency,
      serviceDate: row.serviceDate,
      postedAt: null,
      postedBy: null,
      status: row.status,
      notes: row.notes ?? null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.rows.push(created);
    return created;
  }
  async update(tenantId: string, id: ChargeId, patch: ChargeLineUpdatePatch) {
    const i = this.rows.findIndex((r) => r.tenantId === tenantId && r.id === id);
    if (i === -1) throw new Error("not found");
    const prev = this.rows[i]!;
    const next: ChargeLine = {
      ...prev,
      ...(patch.patientId !== undefined ? { patientId: patch.patientId as PatientId } : {}),
      ...(patch.encounterId !== undefined ? { encounterId: patch.encounterId } : {}),
      ...(patch.orderId !== undefined ? { orderId: patch.orderId } : {}),
      ...(patch.cptCode !== undefined ? { cptCode: patch.cptCode } : {}),
      ...(patch.hcpcsCode !== undefined ? { hcpcsCode: patch.hcpcsCode } : {}),
      ...(patch.revenueCode !== undefined ? { revenueCode: patch.revenueCode } : {}),
      ...(patch.icd10Codes !== undefined ? { icd10Codes: [...patch.icd10Codes] } : {}),
      ...(patch.modifiers !== undefined ? { modifiers: [...patch.modifiers] } : {}),
      ...(patch.units !== undefined ? { units: patch.units } : {}),
      ...(patch.unitPriceMinor !== undefined ? { unitPriceMinor: patch.unitPriceMinor } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.serviceDate !== undefined ? { serviceDate: patch.serviceDate } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.postedAt !== undefined ? { postedAt: patch.postedAt } : {}),
      ...(patch.postedBy !== undefined ? { postedBy: patch.postedBy } : {}),
      updatedAt: new Date().toISOString(),
    };
    next.totalMinor = next.units * next.unitPriceMinor;
    this.rows[i] = next;
    return next;
  }
  async delete(tenantId: string, id: ChargeId) {
    this.rows = this.rows.filter((r) => !(r.tenantId === tenantId && r.id === id));
  }
  async isLineOnSubmittedClaim(_tenantId: string, chargeId: ChargeId) {
    return this.onSubmittedClaim.has(chargeId as string);
  }
  async listEncounterDiagnosisCodes(_tenantId: string, encounterId: EncounterId) {
    return this.encounterDx.get(encounterId as string) ?? [];
  }
}

function svc(overrides: { now?: Date; data?: InMemoryData } = {}) {
  const data = overrides.data ?? new InMemoryData();
  const service = new ChargeServiceImpl({
    data,
    clock: overrides.now ? () => overrides.now! : () => new Date("2026-04-20T12:00:00Z"),
  });
  return { service, data };
}

const VALID_CREATE_INPUT: CreateChargeLineInput = {
  patientId: PATIENT,
  encounterId: ENCOUNTER,
  cptCode: "99213",
  icd10Codes: [],
  modifiers: [],
  units: 1,
  unitPriceMinor: 12500,
  currency: "USD",
  serviceDate: "2026-04-20",
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("rollup", () => {
  it("empty for no lines", () => expect(rollup([])).toBe("empty"));
  it("voided when every non-voided line is absent", () =>
    expect(rollup([line({ status: "voided" })])).toBe("voided"));
  it("draft when any draft is present", () =>
    expect(rollup([line({ status: "draft" }), line({ status: "posted" })])).toBe("draft"));
  it("on_claim when any billed line is present", () =>
    expect(rollup([line({ status: "billed" }), line({ status: "posted" })])).toBe("on_claim"));
  it("ready_for_claim when all non-voided lines are posted", () =>
    expect(rollup([line({ status: "posted" }), line({ status: "voided" })])).toBe(
      "ready_for_claim",
    ));
});

describe("assertCptXorHcpcs", () => {
  it("accepts CPT only", () => expect(() => assertCptXorHcpcs("99213", null)).not.toThrow());
  it("accepts HCPCS only", () => expect(() => assertCptXorHcpcs(null, "A0425")).not.toThrow());
  it("rejects both", () => expect(() => assertCptXorHcpcs("99213", "A0425")).toThrow(/only one/));
  it("rejects neither", () => expect(() => assertCptXorHcpcs(null, null)).toThrow(/required/));
});

describe("assertServiceDateNotFuture", () => {
  it("allows today", () =>
    expect(() =>
      assertServiceDateNotFuture("2026-04-20", new Date("2026-04-20T12:00:00Z")),
    ).not.toThrow());
  it("allows past", () =>
    expect(() =>
      assertServiceDateNotFuture("2026-04-19", new Date("2026-04-20T12:00:00Z")),
    ).not.toThrow());
  it("rejects future", () =>
    expect(() =>
      assertServiceDateNotFuture("2026-04-22", new Date("2026-04-20T12:00:00Z")),
    ).toThrow(/future/));
});

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

describe("permissions", () => {
  it("list refused without any billing perm", async () => {
    const { service } = svc();
    await expect(service.listByEncounter(ctx({ perms: [] }), ENCOUNTER)).rejects.toThrow(
      /billing:read|charges:capture/,
    );
  });
  it("create refused without write perm", async () => {
    const { service } = svc();
    await expect(
      service.create(ctx({ perms: ["billing:read"] }), VALID_CREATE_INPUT),
    ).rejects.toThrow(/billing:write|charges:capture/);
  });
  it("charges:capture is sufficient for create", async () => {
    const { service } = svc();
    await expect(
      service.create(ctx({ perms: ["charges:capture"] }), VALID_CREATE_INPUT),
    ).resolves.toBeDefined();
  });
  it("charges:capture is sufficient for post", async () => {
    const { service, data } = svc();
    await service.create(ctx(), { ...VALID_CREATE_INPUT, icd10Codes: ["J02.9"] });
    const id = data.rows[0]!.id;
    await expect(service.post(ctx({ perms: ["charges:capture"] }), id)).resolves.toBeDefined();
  });
  it("void refused for charges:capture (requires billing:write)", async () => {
    const { service, data } = svc();
    data.rows.push(line({ status: "posted" }));
    await expect(
      service.void(ctx({ perms: ["charges:capture"] }), data.rows[0]!.id, {
        reason: "error",
      }),
    ).rejects.toThrow(/billing:write|FORBIDDEN/);
  });
});

// ---------------------------------------------------------------------------
// create / update / delete
// ---------------------------------------------------------------------------

describe("create", () => {
  it("creates a draft line", async () => {
    const { service } = svc();
    const created = await service.create(ctx(), VALID_CREATE_INPUT);
    expect(created.status).toBe("draft");
    expect(created.totalMinor).toBe(12500);
  });
  it("rejects CPT + HCPCS both", async () => {
    const { service } = svc();
    await expect(
      service.create(ctx(), {
        ...VALID_CREATE_INPUT,
        cptCode: "99213",
        hcpcsCode: "A0425",
      }),
    ).rejects.toThrow();
  });
  it("rejects neither CPT nor HCPCS", async () => {
    const { service } = svc();
    await expect(service.create(ctx(), { ...VALID_CREATE_INPUT, cptCode: null })).rejects.toThrow();
  });
  it("rejects future service date", async () => {
    const { service } = svc();
    await expect(
      service.create(ctx(), { ...VALID_CREATE_INPUT, serviceDate: "2026-04-25" }),
    ).rejects.toThrow(/future/);
  });
});

describe("update", () => {
  it("patches a draft line", async () => {
    const { service, data } = svc();
    await service.create(ctx(), VALID_CREATE_INPUT);
    const id = data.rows[0]!.id;
    const updated = await service.update(ctx(), id, { unitPriceMinor: 13500 });
    expect(updated.unitPriceMinor).toBe(13500);
    expect(updated.totalMinor).toBe(13500);
  });
  it("refuses to update a posted line", async () => {
    const { service, data } = svc();
    data.rows.push(line({ status: "posted" }));
    await expect(
      service.update(ctx(), data.rows[0]!.id, { unitPriceMinor: 99999 }),
    ).rejects.toThrow(/posted|bad_state/);
  });
  it("404 for unknown id", async () => {
    const { service } = svc();
    await expect(
      service.update(ctx(), "99999999-9999-4999-8999-999999999999" as ChargeId, { units: 2 }),
    ).rejects.toThrow(/not_found|not found/);
  });
});

describe("delete", () => {
  it("deletes a draft", async () => {
    const { service, data } = svc();
    await service.create(ctx(), VALID_CREATE_INPUT);
    await service.delete(ctx(), data.rows[0]!.id);
    expect(data.rows).toHaveLength(0);
  });
  it("refuses to delete a posted line", async () => {
    const { service, data } = svc();
    data.rows.push(line({ status: "posted" }));
    await expect(service.delete(ctx(), data.rows[0]!.id)).rejects.toThrow(/bad_state|posted/);
  });
});

// ---------------------------------------------------------------------------
// post
// ---------------------------------------------------------------------------

describe("post", () => {
  it("posts a draft with ICD-10", async () => {
    const { service, data } = svc();
    await service.create(ctx(), { ...VALID_CREATE_INPUT, icd10Codes: ["J02.9"] });
    const id = data.rows[0]!.id;
    const posted = await service.post(ctx(), id);
    expect(posted.status).toBe("posted");
    expect(posted.postedBy).toBe(USER);
    expect(posted.postedAt).toBeTruthy();
  });
  it("refuses post without ICD-10", async () => {
    const { service, data } = svc();
    await service.create(ctx(), VALID_CREATE_INPUT);
    await expect(service.post(ctx(), data.rows[0]!.id)).rejects.toThrow(/ICD-10|missing_icd10/);
  });
  it("refuses post of non-draft line", async () => {
    const { service, data } = svc();
    data.rows.push(line({ status: "posted" }));
    await expect(service.post(ctx(), data.rows[0]!.id)).rejects.toThrow(/bad_state|posted/);
  });
  it("refuses post while impersonating", async () => {
    const { service, data } = svc();
    data.rows.push(line({ status: "draft", icd10Codes: ["J02.9"] }));
    await expect(service.post(ctx({ impersonating: true }), data.rows[0]!.id)).rejects.toThrow(
      /impersonat/i,
    );
  });
});

// ---------------------------------------------------------------------------
// void
// ---------------------------------------------------------------------------

describe("void", () => {
  it("voids a posted line", async () => {
    const { service, data } = svc();
    data.rows.push(line({ status: "posted" }));
    const v = await service.void(ctx({ perms: ["billing:write"] }), data.rows[0]!.id, {
      reason: "duplicate entry",
    });
    expect(v.status).toBe("voided");
    expect(v.notes).toMatch(/VOID: duplicate entry/);
  });
  it("refuses void for lines on submitted claims", async () => {
    const { service, data } = svc();
    data.rows.push(line({ status: "posted" }));
    data.onSubmittedClaim.add(data.rows[0]!.id as string);
    await expect(
      service.void(ctx({ perms: ["billing:write"] }), data.rows[0]!.id, {
        reason: "cannot void",
      }),
    ).rejects.toThrow(/on_submitted_claim|submitted/);
  });
  it("refuses re-void of a voided line", async () => {
    const { service, data } = svc();
    data.rows.push(line({ status: "voided" }));
    await expect(
      service.void(ctx({ perms: ["billing:write"] }), data.rows[0]!.id, {
        reason: "already gone",
      }),
    ).rejects.toThrow(/already voided|bad_state/);
  });
});

// ---------------------------------------------------------------------------
// postAllDrafts
// ---------------------------------------------------------------------------

describe("postAllDrafts", () => {
  it("posts every draft line atomically (in order)", async () => {
    const { service, data } = svc();
    data.rows.push(
      line({ id: "a1" as ChargeId, status: "draft", cptCode: "99213", icd10Codes: ["J02.9"] }),
      line({ id: "a2" as ChargeId, status: "draft", cptCode: "87430", icd10Codes: ["J02.9"] }),
    );
    data.encounterDx.set(ENCOUNTER as string, ["J02.9"]);
    const result = await service.postAllDrafts(ctx(), ENCOUNTER);
    expect(result.posted).toHaveLength(2);
    expect(result.posted.every((l) => l.status === "posted")).toBe(true);
    expect(result.warnings).toEqual([]);
  });
  it("aborts if any draft lacks ICD-10 — nothing transitions", async () => {
    const { service, data } = svc();
    data.rows.push(
      line({ id: "a1" as ChargeId, status: "draft", icd10Codes: ["J02.9"] }),
      line({ id: "a2" as ChargeId, status: "draft", cptCode: "87430", icd10Codes: [] }),
    );
    await expect(service.postAllDrafts(ctx(), ENCOUNTER)).rejects.toThrow(
      /missing_icd10|no ICD-10/,
    );
    expect(data.rows.every((r) => r.status === "draft")).toBe(true);
  });
  it("warns (does not fail) when ICD-10 is not in encounter DX list", async () => {
    const { service, data } = svc();
    data.rows.push(line({ id: "a1" as ChargeId, status: "draft", icd10Codes: ["Z00.00"] }));
    data.encounterDx.set(ENCOUNTER as string, ["J02.9"]);
    const result = await service.postAllDrafts(ctx(), ENCOUNTER);
    expect(result.posted).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("Z00.00"))).toBe(true);
  });
  it("warns on duplicate CPT+modifier+date", async () => {
    const { service, data } = svc();
    data.rows.push(
      line({ id: "a1" as ChargeId, status: "draft", icd10Codes: ["J02.9"] }),
      line({ id: "a2" as ChargeId, status: "draft", icd10Codes: ["J02.9"] }),
    );
    data.encounterDx.set(ENCOUNTER as string, ["J02.9"]);
    const result = await service.postAllDrafts(ctx(), ENCOUNTER);
    expect(result.warnings.some((w) => /99213/.test(w))).toBe(true);
  });
  it("returns empty result when no drafts", async () => {
    const { service, data } = svc();
    data.rows.push(line({ status: "posted" }));
    const result = await service.postAllDrafts(ctx(), ENCOUNTER);
    expect(result.posted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getChargeForEncounter
// ---------------------------------------------------------------------------

describe("getChargeForEncounter", () => {
  it("returns null when no lines", async () => {
    const { service } = svc();
    await expect(service.getChargeForEncounter(ctx(), ENCOUNTER)).resolves.toBeNull();
  });
  it("aggregates totals excluding voided lines", async () => {
    const { service, data } = svc();
    data.rows.push(
      line({ id: "a1" as ChargeId, status: "posted", unitPriceMinor: 12500 }),
      line({ id: "a2" as ChargeId, status: "posted", unitPriceMinor: 4500 }),
      line({ id: "a3" as ChargeId, status: "voided", unitPriceMinor: 3500 }),
    );
    const agg = await service.getChargeForEncounter(ctx(), ENCOUNTER);
    expect(agg).not.toBeNull();
    expect(agg!.totalMinor).toBe(17000);
    expect(agg!.rollupStatus).toBe("ready_for_claim");
  });
});

// ---------------------------------------------------------------------------
// ChargeError class
// ---------------------------------------------------------------------------

describe("ChargeError", () => {
  it("exposes code + name", () => {
    const err = new ChargeError("missing_icd10", "no icd10");
    expect(err.name).toBe("ChargeError");
    expect(err.code).toBe("missing_icd10");
  });
});
