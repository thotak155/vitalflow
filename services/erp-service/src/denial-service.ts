import { logEventBestEffort } from "@vitalflow/auth/audit";
import { badState, forbidden, notFound, validation } from "@vitalflow/shared-utils/errors";
import {
  AppealDenialInputSchema,
  AssignDenialInputSchema,
  CreateDenialInputSchema,
  RecordDenialWorkInputSchema,
  ResolveDenialInputSchema,
  WriteOffDenialInputSchema,
  type AppealDenialInput,
  type AssignDenialInput,
  type CreateDenialInput,
  type Denial,
  type DenialId,
  type DenialQueueFilter,
  type DenialService,
  type Insert,
  type RecordDenialWorkInput,
  type ResolveDenialInput,
  type TenantContext,
  type WriteOffDenialInput,
} from "@vitalflow/types";

import type { DenialDataAccess } from "./supabase-data-access.js";

/**
 * DenialServiceImpl — workflow engine for the denial queue.
 *
 * Lifecycle: open → working → appealed → resolved | written_off | uncollectable
 *
 * Only the DB state machine is enforced here; ClaimService.applyRemittance is
 * the primary caller of `createFromClaim`. When a parent claim is marked
 * `paid` after a denial was opened, the denial auto-closes via the
 * reconcilePaidAfterDenial path.
 *
 * Write-off is the one permission-gated fork: `billing:write_off` instead of
 * `billing:write`. Both live on the same role list today (billers + practice
 * owners), but keeping them separate gives us a clean upgrade path to a
 * write-off-approval workflow later.
 */

export interface DenialServiceDeps {
  readonly data: DenialDataAccess;
  readonly clock?: () => Date;
}

const TERMINAL_STATES: readonly Denial["status"][] = ["resolved", "written_off", "uncollectable"];

export class DenialServiceImpl implements DenialService {
  constructor(private readonly deps: DenialServiceDeps) {}

  async list(ctx: TenantContext, filter: DenialQueueFilter): Promise<readonly Denial[]> {
    requireRead(ctx);
    // Service layer decides "default view" = open + working; callers pass
    // explicit status if they want something else.
    const statuses =
      filter.status && filter.status.length > 0 ? filter.status : (["open", "working"] as const);
    return this.deps.data.list(ctx.tenantId, {
      status: statuses,
      assignedTo: filter.assignedTo ?? null,
      priority: filter.priority,
      claimId: filter.claimId,
      limit: filter.limit,
      offset: filter.offset,
    });
  }

  async getById(ctx: TenantContext, id: DenialId): Promise<Denial | null> {
    requireRead(ctx);
    return this.deps.data.getById(ctx.tenantId, id);
  }

  async createFromClaim(ctx: TenantContext, input: CreateDenialInput): Promise<Denial> {
    requireWrite(ctx);
    const parsed = CreateDenialInputSchema.parse(input);

    const row: Insert<"denials"> = {
      tenant_id: ctx.tenantId,
      claim_id: parsed.claimId as string,
      claim_line_id: parsed.claimLineId ?? null,
      denial_codes: [...parsed.denialCodes],
      reason_text: parsed.reasonText ?? null,
      status: "open",
      priority: parsed.priority,
      denied_amount_minor: parsed.deniedAmountMinor,
      recovered_amount_minor: 0,
      currency: "USD",
    };
    const denial = await this.deps.data.insert(row);

    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "denial.created",
      targetTable: "denials",
      targetRowId: denial.id as string,
      details: {
        claim_id: parsed.claimId as string,
        claim_line_id: parsed.claimLineId ?? null,
        denied_amount_minor: parsed.deniedAmountMinor,
        codes: parsed.denialCodes,
        priority: parsed.priority,
      },
    });

    return denial;
  }

  async assign(ctx: TenantContext, id: DenialId, input: AssignDenialInput): Promise<Denial> {
    requireWrite(ctx);
    if (ctx.impersonation) throw forbidden("Cannot reassign denials while impersonating");

    const parsed = AssignDenialInputSchema.parse(input);
    const current = await this.ensureNotTerminal(ctx, id, "assign");

    const next = await this.deps.data.update(ctx.tenantId, id, {
      assigned_to: parsed.assignedTo as string,
      assigned_at: this.now().toISOString(),
      status: current.status === "open" ? "working" : current.status,
    });

    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "denial.assigned",
      targetTable: "denials",
      targetRowId: id as string,
      details: {
        assignee: parsed.assignedTo as string,
        previous_status: current.status,
      },
    });

    return next;
  }

  async recordWork(
    ctx: TenantContext,
    id: DenialId,
    input: RecordDenialWorkInput,
  ): Promise<Denial> {
    requireWrite(ctx);
    const parsed = RecordDenialWorkInputSchema.parse(input);
    const current = await this.ensureNotTerminal(ctx, id, "recordWork");

    const prefix = `[${this.now().toISOString()}] ${(ctx.userId as string).slice(0, 8)}: `;
    const nextNote = appendNote(current.workNote, `${prefix}${parsed.workNote}`);

    const next = await this.deps.data.update(ctx.tenantId, id, {
      work_note: nextNote,
      priority: parsed.priority ?? current.priority,
      status: current.status === "open" ? "working" : current.status,
    });

    return next;
  }

  async resolve(ctx: TenantContext, id: DenialId, input: ResolveDenialInput): Promise<Denial> {
    requireWrite(ctx);
    const parsed = ResolveDenialInputSchema.parse(input);
    const current = await this.ensureNotTerminal(ctx, id, "resolve");

    if (parsed.recoveredAmountMinor > current.deniedAmountMinor) {
      throw validation("Recovered amount exceeds denied amount", {
        recovered: parsed.recoveredAmountMinor,
        denied: current.deniedAmountMinor,
      });
    }

    const next = await this.deps.data.update(ctx.tenantId, id, {
      status: "resolved",
      resolution: parsed.resolution,
      recovered_amount_minor: parsed.recoveredAmountMinor,
    });

    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "denial.resolved",
      targetTable: "denials",
      targetRowId: id as string,
      details: {
        recovered_amount_minor: parsed.recoveredAmountMinor,
        previous_status: current.status,
      },
    });

    return next;
  }

  async writeOff(ctx: TenantContext, id: DenialId, input: WriteOffDenialInput): Promise<Denial> {
    requireWriteOff(ctx);
    const parsed = WriteOffDenialInputSchema.parse(input);
    const current = await this.ensureNotTerminal(ctx, id, "writeOff");

    const next = await this.deps.data.update(ctx.tenantId, id, {
      status: "written_off",
      resolution: `WRITE-OFF: ${parsed.reason}`,
    });

    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "write_off.applied",
      targetTable: "denials",
      targetRowId: id as string,
      details: {
        reason_length: parsed.reason.length,
        denied_amount_minor: current.deniedAmountMinor,
      },
    });
    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "denial.resolved",
      targetTable: "denials",
      targetRowId: id as string,
      details: { via: "write_off" },
    });

    return next;
  }

  async appeal(ctx: TenantContext, id: DenialId, input: AppealDenialInput): Promise<Denial> {
    requireWrite(ctx);
    const parsed = AppealDenialInputSchema.parse(input);
    const current = await this.ensureNotTerminal(ctx, id, "appeal");

    const prefix = `[${this.now().toISOString()}] ${(ctx.userId as string).slice(0, 8)} APPEAL: `;
    const nextNote = appendNote(current.workNote, `${prefix}${parsed.note}`);

    return this.deps.data.update(ctx.tenantId, id, {
      status: "appealed",
      work_note: nextNote,
    });
  }

  /**
   * Reconciliation — if the parent claim has been paid since the denial
   * opened, auto-close the denial with a standard resolution. Called by
   * ClaimService.applyRemittance post-transition.
   */
  async reconcilePaidAfterDenial(ctx: TenantContext, id: DenialId): Promise<Denial | null> {
    requireWrite(ctx);
    const current = await this.deps.data.getById(ctx.tenantId, id);
    if (!current) return null;
    if (TERMINAL_STATES.includes(current.status)) return current;

    const parentStatus = await this.deps.data.getParentClaimStatus(
      ctx.tenantId,
      current.claimId as string,
    );
    if (parentStatus !== "paid") return current;

    const next = await this.deps.data.update(ctx.tenantId, id, {
      status: "resolved",
      resolution: "paid_after_denial",
      recovered_amount_minor: current.deniedAmountMinor,
    });

    await logEventBestEffort({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      eventType: "denial.resolved",
      targetTable: "denials",
      targetRowId: id as string,
      details: { via: "auto_reconcile_paid" },
    });

    return next;
  }

  // -------------------------------------------------------------------------

  private async ensureNotTerminal(ctx: TenantContext, id: DenialId, op: string): Promise<Denial> {
    const current = await this.deps.data.getById(ctx.tenantId, id);
    if (!current) throw notFound(`denial ${id as string} not found`);
    if (TERMINAL_STATES.includes(current.status)) {
      throw badState(`cannot ${op} a ${current.status} denial`, {
        current_status: current.status,
      });
    }
    return current;
  }

  private now(): Date {
    return this.deps.clock ? this.deps.clock() : new Date();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appendNote(existing: string | null | undefined, addition: string): string {
  if (!existing) return addition;
  return `${existing}\n${addition}`;
}

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

function requireWriteOff(ctx: TenantContext): void {
  if (!ctx.permissions.includes("billing:write_off")) {
    throw forbidden("billing:write_off required");
  }
}
