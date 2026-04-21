import { logEventBestEffort } from "@vitalflow/auth/audit";
import { requirePermission } from "@vitalflow/auth/rbac";
import { forbidden } from "@vitalflow/shared-utils/errors";
import {
  CreateChargeLineInputSchema,
  UpdateChargeLineInputSchema,
  VoidChargeInputSchema,
  type AgingBand,
  type Charge,
  type ChargeId,
  type ChargeLine,
  type ChargeRollupStatus,
  type CreateChargeLineInput,
  type EncounterId,
  type PatientId,
  type Permission,
  type TenantContext,
  type UpdateChargeLineInput,
  type UserId,
  type VoidChargeInput,
} from "@vitalflow/types";

/**
 * ChargeServiceImpl — V1 charge capture.
 *
 * The service enforces:
 *   - permission gate (billing:write OR charges:capture on write paths)
 *   - CPT xor HCPCS at create / update time
 *   - service_date ≤ today
 *   - ICD-10 required at post time
 *   - status-machine invariants (draft → posted → billed → voided)
 *   - no void for lines on a submitted claim
 *   - audit events on post + void
 *
 * Data access is abstracted behind `ChargeDataAccess` so tests pass a mock.
 * The Next.js app wires the admin Supabase client behind this interface via
 * `makeSupabaseChargeDataAccess` (next slice).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChargeDataAccess {
  listByEncounter(tenantId: string, encounterId: EncounterId): Promise<ChargeLine[]>;

  getById(tenantId: string, id: ChargeId): Promise<ChargeLine | null>;

  insert(row: ChargeLineInsertRow): Promise<ChargeLine>;

  update(tenantId: string, id: ChargeId, patch: ChargeLineUpdatePatch): Promise<ChargeLine>;

  delete(tenantId: string, id: ChargeId): Promise<void>;

  /**
   * True iff this ChargeLine is linked from any claim_line whose parent
   * claim is NOT in a corrective state ('rejected', 'closed'). Used to block
   * void + edit on billed lines.
   */
  isLineOnSubmittedClaim(tenantId: string, chargeId: ChargeId): Promise<boolean>;

  /** ICD-10 codes present on the encounter's diagnosis_assignments rows. */
  listEncounterDiagnosisCodes(tenantId: string, encounterId: EncounterId): Promise<string[]>;
}

export interface ChargeLineInsertRow {
  readonly tenantId: string;
  readonly patientId: string;
  readonly encounterId: EncounterId | null;
  readonly orderId?: string | null;
  readonly cptCode?: string | null;
  readonly hcpcsCode?: string | null;
  readonly revenueCode?: string | null;
  readonly icd10Codes: readonly string[];
  readonly modifiers: readonly string[];
  readonly units: number;
  readonly unitPriceMinor: number;
  readonly currency: string;
  readonly serviceDate: string;
  readonly notes?: string | null;
  readonly status: ChargeLine["status"];
}

export interface ChargeLineUpdatePatch {
  patientId?: string;
  encounterId?: EncounterId | null;
  orderId?: string | null;
  cptCode?: string | null;
  hcpcsCode?: string | null;
  revenueCode?: string | null;
  icd10Codes?: readonly string[];
  modifiers?: readonly string[];
  units?: number;
  unitPriceMinor?: number;
  currency?: string;
  serviceDate?: string;
  notes?: string | null;
  status?: ChargeLine["status"];
  postedAt?: string | null;
  postedBy?: UserId | null;
}

export interface ChargeServiceDeps {
  readonly data: ChargeDataAccess;
  readonly clock?: () => Date;
  /**
   * Optional balance service wired in by the caller. When provided,
   * `post` and `postAllDrafts` push a positive delta into the patient's
   * A/R rollup. Without it, posting still succeeds but balances stay in
   * sync only via `PatientBalanceService.recalculate`.
   *
   * Typed loosely here to avoid a circular service→service type
   * dependency; Phase 2 ties it to `PatientBalanceService` at wire-time.
   */
  readonly balances?: {
    applyDelta: (
      ctx: TenantContext,
      input: {
        patientId: PatientId;
        deltaMinor: number;
        band: AgingBand;
        touchPayment: boolean;
      },
    ) => Promise<unknown>;
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ChargeError extends Error {
  constructor(
    public readonly code:
      | "bad_state"
      | "missing_icd10"
      | "service_date_future"
      | "on_submitted_claim"
      | "not_found"
      | "cpt_or_hcpcs_required"
      | "cpt_and_hcpcs_exclusive",
    message: string,
  ) {
    super(message);
    this.name = "ChargeError";
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ChargeServiceImpl {
  constructor(private readonly deps: ChargeServiceDeps) {}

  async listByEncounter(
    ctx: TenantContext,
    encounterId: EncounterId,
  ): Promise<readonly ChargeLine[]> {
    requireReadPermission(ctx);
    return this.deps.data.listByEncounter(ctx.tenantId, encounterId);
  }

  async getChargeForEncounter(
    ctx: TenantContext,
    encounterId: EncounterId,
  ): Promise<Charge | null> {
    requireReadPermission(ctx);
    const lines = await this.deps.data.listByEncounter(ctx.tenantId, encounterId);
    if (lines.length === 0) return null;

    const nonVoided = lines.filter((l) => l.status !== "voided");
    const totalMinor = nonVoided.reduce((acc, l) => acc + l.totalMinor, 0);
    const currency = lines[0]?.currency ?? "USD";
    const patientId = lines[0]!.patientId;
    const serviceDate = lines[0]!.serviceDate;

    return {
      encounterId,
      patientId,
      serviceDate,
      lines,
      totalMinor,
      currency,
      rollupStatus: rollup(lines),
    };
  }

  async create(ctx: TenantContext, input: CreateChargeLineInput): Promise<ChargeLine> {
    requireWritePermission(ctx);
    const parsed = CreateChargeLineInputSchema.parse(input);
    assertCptXorHcpcs(parsed.cptCode ?? null, parsed.hcpcsCode ?? null);
    assertServiceDateNotFuture(parsed.serviceDate, this.now());

    const row: ChargeLineInsertRow = {
      tenantId: ctx.tenantId,
      patientId: parsed.patientId,
      encounterId: parsed.encounterId,
      orderId: parsed.orderId ?? null,
      cptCode: parsed.cptCode ?? null,
      hcpcsCode: parsed.hcpcsCode ?? null,
      revenueCode: parsed.revenueCode ?? null,
      icd10Codes: parsed.icd10Codes,
      modifiers: parsed.modifiers,
      units: parsed.units,
      unitPriceMinor: parsed.unitPriceMinor,
      currency: parsed.currency,
      serviceDate: parsed.serviceDate,
      notes: parsed.notes ?? null,
      status: "draft",
    };
    return this.deps.data.insert(row);
  }

  async update(
    ctx: TenantContext,
    id: ChargeId,
    patch: UpdateChargeLineInput,
  ): Promise<ChargeLine> {
    requireWritePermission(ctx);
    const parsed = UpdateChargeLineInputSchema.parse(patch);

    const existing = await this.deps.data.getById(ctx.tenantId, id);
    if (!existing) throw new ChargeError("not_found", `charge ${id} not found`);
    if (existing.status !== "draft") {
      throw new ChargeError(
        "bad_state",
        `cannot update ${existing.status} charge; only draft lines are editable`,
      );
    }

    // If either code is being changed, re-validate xor.
    const nextCpt =
      parsed.cptCode !== undefined ? (parsed.cptCode ?? null) : (existing.cptCode ?? null);
    const nextHcpcs =
      parsed.hcpcsCode !== undefined ? (parsed.hcpcsCode ?? null) : (existing.hcpcsCode ?? null);
    assertCptXorHcpcs(nextCpt, nextHcpcs);

    if (parsed.serviceDate) {
      assertServiceDateNotFuture(parsed.serviceDate, this.now());
    }

    return this.deps.data.update(ctx.tenantId, id, toUpdatePatch(parsed));
  }

  async delete(ctx: TenantContext, id: ChargeId): Promise<void> {
    requireWritePermission(ctx);
    const existing = await this.deps.data.getById(ctx.tenantId, id);
    if (!existing) throw new ChargeError("not_found", `charge ${id} not found`);
    if (existing.status !== "draft") {
      throw new ChargeError(
        "bad_state",
        `cannot delete ${existing.status} charge; only draft lines can be deleted`,
      );
    }
    await this.deps.data.delete(ctx.tenantId, id);
  }

  async post(ctx: TenantContext, id: ChargeId): Promise<ChargeLine> {
    requireWritePermission(ctx);
    if (ctx.impersonation) {
      throw forbidden("Cannot post charges while impersonating");
    }
    const existing = await this.deps.data.getById(ctx.tenantId, id);
    if (!existing) throw new ChargeError("not_found", `charge ${id} not found`);
    if (existing.status !== "draft") {
      throw new ChargeError(
        "bad_state",
        `cannot post ${existing.status} charge; only draft lines can be posted`,
      );
    }
    if (existing.icd10Codes.length === 0) {
      throw new ChargeError("missing_icd10", "cannot post a charge line with no ICD-10 codes");
    }
    assertServiceDateNotFuture(existing.serviceDate, this.now());

    const now = this.now().toISOString();
    const updated = await this.deps.data.update(ctx.tenantId, id, {
      status: "posted",
      postedAt: now,
      postedBy: ctx.userId as UserId,
    });

    // Push a positive delta into patient A/R. Silent no-op when the caller
    // didn't wire a balance service (tests, or the pre-Phase-2 charge flow).
    if (this.deps.balances) {
      await this.deps.balances.applyDelta(ctx, {
        patientId: existing.patientId,
        deltaMinor: existing.totalMinor,
        band: "0-30",
        touchPayment: false,
      });
    }

    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "charge.created",
      targetTable: "charges",
      targetRowId: id as string,
      details: {
        encounter_id: existing.encounterId,
        cpt_code: existing.cptCode,
        hcpcs_code: existing.hcpcsCode,
        units: existing.units,
        total_minor: existing.totalMinor,
      },
    });

    return updated;
  }

  async void(ctx: TenantContext, id: ChargeId, input: VoidChargeInput): Promise<ChargeLine> {
    requirePermission(ctx, "billing:write");
    const parsed = VoidChargeInputSchema.parse(input);

    const existing = await this.deps.data.getById(ctx.tenantId, id);
    if (!existing) throw new ChargeError("not_found", `charge ${id} not found`);
    if (existing.status === "voided") {
      throw new ChargeError("bad_state", "charge is already voided");
    }
    if (existing.status === "draft") {
      // Voiding a draft is unusual — delete is the right path — but allow it.
      // Caller's choice; audit trail preserves the action.
    }

    const onClaim = await this.deps.data.isLineOnSubmittedClaim(ctx.tenantId, id);
    if (onClaim) {
      throw new ChargeError("on_submitted_claim", "cannot void a charge on a submitted claim");
    }

    const updated = await this.deps.data.update(ctx.tenantId, id, {
      status: "voided",
      notes: appendNote(existing.notes, `VOID: ${parsed.reason}`),
    });

    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "charge.voided",
      targetTable: "charges",
      targetRowId: id as string,
      details: {
        encounter_id: existing.encounterId,
        cpt_code: existing.cptCode,
        hcpcs_code: existing.hcpcsCode,
        reason_length: parsed.reason.length,
      },
    });

    return updated;
  }

  /**
   * Post every draft line on the encounter as a single logical step. Runs
   * validations on all candidates before writing any; if any line is
   * missing ICD-10, nothing transitions.
   *
   * Returns the updated list and a list of warnings (non-blocking) for the
   * UI to surface — e.g., ICD-10 not in encounter diagnosis list, or
   * duplicate CPT+modifier on same date.
   */
  async postAllDrafts(
    ctx: TenantContext,
    encounterId: EncounterId,
  ): Promise<{ posted: readonly ChargeLine[]; warnings: readonly string[] }> {
    requireWritePermission(ctx);
    if (ctx.impersonation) {
      throw forbidden("Cannot post charges while impersonating");
    }

    const lines = await this.deps.data.listByEncounter(ctx.tenantId, encounterId);
    const drafts = lines.filter((l) => l.status === "draft");
    if (drafts.length === 0) {
      return { posted: [], warnings: ["no draft lines to post"] };
    }

    // All-or-nothing: validate every line first.
    for (const line of drafts) {
      if (line.icd10Codes.length === 0) {
        throw new ChargeError(
          "missing_icd10",
          `line ${line.cptCode ?? line.hcpcsCode ?? line.id} has no ICD-10 codes`,
        );
      }
      assertServiceDateNotFuture(line.serviceDate, this.now());
    }

    const encounterDx = await this.deps.data.listEncounterDiagnosisCodes(ctx.tenantId, encounterId);
    const encounterDxSet = new Set(encounterDx);
    const warnings: string[] = [];

    // Warn (non-blocking) if any ICD-10 on a line is not in the encounter's DX list.
    for (const line of drafts) {
      for (const code of line.icd10Codes) {
        if (!encounterDxSet.has(code)) {
          warnings.push(
            `${line.cptCode ?? line.hcpcsCode ?? ""} cites ${code} which is not on the encounter diagnosis list`,
          );
        }
      }
    }

    // Warn on duplicate CPT+modifier+service_date.
    const seen = new Map<string, number>();
    for (const line of drafts) {
      const key = [
        line.cptCode ?? line.hcpcsCode ?? "",
        [...line.modifiers].sort().join(","),
        line.serviceDate,
      ].join("|");
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seen) {
      if (count > 1) {
        warnings.push(`${count} lines share ${key} — verify modifiers if bilateral`);
      }
    }

    const now = this.now().toISOString();
    const posted: ChargeLine[] = [];
    for (const line of drafts) {
      const updated = await this.deps.data.update(ctx.tenantId, line.id, {
        status: "posted",
        postedAt: now,
        postedBy: ctx.userId as UserId,
      });
      posted.push(updated);

      if (this.deps.balances) {
        await this.deps.balances.applyDelta(ctx, {
          patientId: line.patientId,
          deltaMinor: line.totalMinor,
          band: "0-30",
          touchPayment: false,
        });
      }

      await logEventBestEffort({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        eventType: "charge.created",
        targetTable: "charges",
        targetRowId: line.id as string,
        details: {
          encounter_id: encounterId,
          cpt_code: line.cptCode,
          hcpcs_code: line.hcpcsCode,
          units: line.units,
          total_minor: line.totalMinor,
        },
      });
    }

    return { posted, warnings };
  }

  // ---- internals ----------------------------------------------------------

  private now(): Date {
    return this.deps.clock ? this.deps.clock() : new Date();
  }
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

function requireReadPermission(ctx: TenantContext): void {
  if (!hasAny(ctx, ["billing:read", "charges:capture"])) {
    throw forbidden("billing:read or charges:capture required");
  }
}

function requireWritePermission(ctx: TenantContext): void {
  if (!hasAny(ctx, ["billing:write", "charges:capture"])) {
    throw forbidden("billing:write or charges:capture required");
  }
}

function hasAny(ctx: TenantContext, perms: readonly Permission[]): boolean {
  for (const p of perms) if (ctx.permissions.includes(p)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function rollup(lines: readonly ChargeLine[]): ChargeRollupStatus {
  if (lines.length === 0) return "empty";
  const nonVoided = lines.filter((l) => l.status !== "voided");
  if (nonVoided.length === 0) return "voided";
  if (nonVoided.some((l) => l.status === "draft")) return "draft";
  if (nonVoided.some((l) => l.status === "billed")) return "on_claim";
  if (nonVoided.every((l) => l.status === "posted")) return "ready_for_claim";
  return "draft";
}

export function assertCptXorHcpcs(cpt: string | null, hcpcs: string | null): void {
  if (!cpt && !hcpcs) {
    throw new ChargeError("cpt_or_hcpcs_required", "either cptCode or hcpcsCode is required");
  }
  if (cpt && hcpcs) {
    throw new ChargeError("cpt_and_hcpcs_exclusive", "only one of cptCode or hcpcsCode may be set");
  }
}

export function assertServiceDateNotFuture(serviceDate: string, now: Date): void {
  // Compare as dates in UTC.
  const today = now.toISOString().slice(0, 10);
  if (serviceDate > today) {
    throw new ChargeError("service_date_future", "service_date cannot be in the future");
  }
}

function appendNote(existing: string | null | undefined, addition: string): string {
  if (!existing) return addition;
  return `${existing}\n${addition}`;
}

function toUpdatePatch(parsed: UpdateChargeLineInput): ChargeLineUpdatePatch {
  const out: ChargeLineUpdatePatch = {};
  if (parsed.patientId !== undefined) (out as Record<string, unknown>).patientId = parsed.patientId;
  if (parsed.encounterId !== undefined) out.encounterId = parsed.encounterId ?? null;
  if (parsed.orderId !== undefined) out.orderId = parsed.orderId ?? null;
  if (parsed.cptCode !== undefined) out.cptCode = parsed.cptCode ?? null;
  if (parsed.hcpcsCode !== undefined) out.hcpcsCode = parsed.hcpcsCode ?? null;
  if (parsed.revenueCode !== undefined) out.revenueCode = parsed.revenueCode ?? null;
  if (parsed.icd10Codes !== undefined) out.icd10Codes = parsed.icd10Codes;
  if (parsed.modifiers !== undefined) out.modifiers = parsed.modifiers;
  if (parsed.units !== undefined) out.units = parsed.units;
  if (parsed.unitPriceMinor !== undefined) out.unitPriceMinor = parsed.unitPriceMinor;
  if (parsed.currency !== undefined) out.currency = parsed.currency;
  if (parsed.serviceDate !== undefined) out.serviceDate = parsed.serviceDate;
  if (parsed.notes !== undefined) out.notes = parsed.notes ?? null;
  return out;
}
