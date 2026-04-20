import { z } from "zod";

import { createVitalFlowAdminClient } from "./admin.js";

/**
 * App-level audit event logger.
 *
 * Use from Server Actions and Route Handlers for events that DB triggers can't
 * capture (login, AI draft generation context, impersonation reason, etc.).
 *
 * Row-level writes (INSERT/UPDATE/DELETE on audited tables) are already
 * captured by `audit.log_change()`; do NOT call logEvent() for those. Only
 * call this for semantic, app-visible events.
 *
 * See docs/audit-logging.md §2 for the taxonomy.
 */

// ---------- Event type taxonomy ---------------------------------------------

export const AUDIT_EVENT_TYPES = [
  // Session & identity
  "auth.login",
  "auth.login_failed",
  "auth.logout",
  "auth.password_reset_requested",
  "auth.password_changed",
  // Membership & invites
  "member.invited",
  "member.invite_accepted",
  "member.invite_cancelled",
  "member.added",
  "member.roles_changed",
  "member.removed",
  // Patient & clinical
  "patient.created",
  "patient.updated",
  "patient.merged",
  "encounter.opened",
  "encounter.completed",
  "encounter.cancelled",
  "note.created",
  "note.updated",
  "note.signed",
  "note.amended",
  "clinical_list.item_added",
  "clinical_list.item_updated",
  "clinical_list.item_resolved",
  // AI
  "ai.draft_generated",
  "ai.draft_accepted",
  "ai.draft_rejected",
  "ai.draft_edited_and_signed",
  // Revenue cycle
  "charge.created",
  "charge.updated",
  "charge.voided",
  "invoice.issued",
  "invoice.paid",
  "invoice.voided",
  "claim.submitted",
  "claim.status_changed",
  "claim.denied",
  "claim.appealed",
  "payment.recorded",
  "payment.refunded",
  "write_off.applied",
  // Administrative
  "admin.setting_changed",
  "admin.integration_connected",
  "admin.integration_disconnected",
  "admin.feature_flag_toggled",
  "admin.entitlement_granted",
  "admin.entitlement_revoked",
  "admin.audit_exported",
  // Impersonation
  "impersonation.started",
  "impersonation.ended",
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

// ---------- Shared context shapes -------------------------------------------

export const AuditRequestContextSchema = z.object({
  requestId: z.string().min(1).optional(),
  ip: z.string().ip().optional(),
  userAgent: z.string().max(1024).optional(),
});
export type AuditRequestContext = z.infer<typeof AuditRequestContextSchema>;

const LogEventInputInternalSchema = z.object({
  /** Tenant scope. `null` for platform-level events (e.g. platform_admins change). */
  tenantId: z.string().uuid().nullable(),
  /** Acting user. `null` for system / webhook events. */
  actorId: z.string().uuid().nullable(),
  /** Impersonator id, if the actor was impersonating. Usually omit — the helper will not infer this. */
  impersonatorId: z.string().uuid().nullable().optional(),
  /** Semantic event type from AUDIT_EVENT_TYPES. */
  eventType: z.enum(AUDIT_EVENT_TYPES),
  /** Row-level events set to INSERT/UPDATE/DELETE; app events use APP. */
  action: z.enum(["INSERT", "UPDATE", "DELETE", "APP"]).default("APP"),
  /**
   * Event-specific metadata. Keep flat and PHI-free — reference IDs are fine,
   * full patient names / DOB are NOT. See docs/audit-logging.md §9.
   */
  details: z.record(z.string(), z.unknown()).default({}),
  /** Target row (optional — when the event is tied to a specific row). */
  targetTable: z.string().optional(),
  targetRowId: z.string().optional(),
  /** Request context — omit and the helper reads from ambient if/when we add an ALS bridge. */
  request: AuditRequestContextSchema.optional(),
});
export const LogEventInputSchema = LogEventInputInternalSchema;
/** Public input type — fields with zod defaults (`action`, `details`) are optional at call sites. */
export type LogEventInput = z.input<typeof LogEventInputInternalSchema>;

// ---------- PHI guard --------------------------------------------------------

/**
 * Field names that must NOT appear in `details`. Catches common mistakes early.
 * Extend as the domain grows — this is a best-effort guard, not a replacement
 * for the code-review rule "details is metadata only, not PHI".
 */
const PHI_FIELDS = new Set([
  "first_name",
  "last_name",
  "full_name",
  "date_of_birth",
  "dob",
  "ssn",
  "address",
  "phone",
  "email", // debatable — staff email is fine, patient email is PHI; guard errs on the strict side
  "note_text",
  "chief_complaint",
  "prompt", // raw AI prompts may echo PHI
]);

function assertNoPhi(details: Record<string, unknown>): void {
  for (const key of Object.keys(details)) {
    if (PHI_FIELDS.has(key)) {
      throw new Error(
        `audit logEvent(): details.${key} is a PHI-carrying field name. ` +
          `Store a reference id instead (e.g. patient_id, encounter_id). ` +
          `See docs/audit-logging.md §9.`,
      );
    }
  }
}

// ---------- Core helper ------------------------------------------------------

/**
 * Insert an audit event. Uses the service-role client because the
 * audit.audit_events table is RLS-protected for reads and has no public
 * INSERT policy — all writes come from triggers or this helper.
 *
 * Errors are thrown — callers decide whether to swallow (fire-and-forget) or
 * fail the parent transaction. For billing/clinical signs, DO NOT swallow: if
 * the audit fails, the action should fail. For login/password reset, OK to
 * log and continue on failure.
 */
export async function logEvent(input: LogEventInput): Promise<void> {
  const parsed = LogEventInputInternalSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`logEvent: invalid input — ${parsed.error.message}`);
  }
  assertNoPhi(parsed.data.details);

  const admin = createVitalFlowAdminClient();
  const ctx = parsed.data.request ?? {};

  // `audit.audit_events` is in an external schema — the generated Database
  // type covers only `public`. Cast the client to reach `.schema("audit")`.
  type AdminWithSchema = {
    schema: (s: string) => {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error } = await (admin as unknown as AdminWithSchema)
    .schema("audit")
    .from("audit_events")
    .insert({
      tenant_id: parsed.data.tenantId,
      actor_id: parsed.data.actorId,
      impersonator_id: parsed.data.impersonatorId ?? null,
      event_type: parsed.data.eventType,
      action: parsed.data.action,
      details: parsed.data.details,
      table_schema: parsed.data.targetTable ? "public" : null,
      table_name: parsed.data.targetTable ?? null,
      row_id: parsed.data.targetRowId ?? null,
      request_id: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
      user_agent: ctx.userAgent ?? null,
    });

  if (error) {
    throw new Error(`logEvent(${parsed.data.eventType}) failed: ${error.message}`);
  }
}

// ---------- Convenience helpers ---------------------------------------------

/**
 * Swallow-on-failure variant. Use for non-load-bearing events (login, logout)
 * where we don't want an audit outage to block user flow. Logs to console on
 * failure so observability tooling can pick it up.
 */
export async function logEventBestEffort(input: LogEventInput): Promise<void> {
  try {
    await logEvent(input);
  } catch (err) {
    console.error("[audit] logEventBestEffort failed:", err);
  }
}

/**
 * Typed helpers for the most common events. They narrow `details` so callers
 * can't forget required fields. Extend as new event types get real call sites.
 */

export interface AuthLoginDetails {
  method: "password" | "magic_link" | "sso";
}

export async function logLogin(
  params: { tenantId: string | null; actorId: string; request?: AuditRequestContext } & AuthLoginDetails,
): Promise<void> {
  await logEventBestEffort({
    tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: "auth.login",
    details: { method: params.method },
    request: params.request,
  });
}

export async function logLoginFailed(
  params: {
    tenantId: string | null;
    attemptedEmail: string;
    reason: string;
    request?: AuditRequestContext;
  },
): Promise<void> {
  await logEventBestEffort({
    tenantId: params.tenantId,
    actorId: null,
    eventType: "auth.login_failed",
    details: { attempted_email: params.attemptedEmail, reason: params.reason },
    request: params.request,
  });
}

export interface AiDraftGeneratedDetails {
  completionId: string;
  model: string;
  patientId?: string;
  encounterId?: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export async function logAiDraftGenerated(
  params: {
    tenantId: string;
    actorId: string;
    request?: AuditRequestContext;
  } & AiDraftGeneratedDetails,
): Promise<void> {
  await logEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: "ai.draft_generated",
    targetTable: "ai_completions",
    targetRowId: params.completionId,
    details: {
      model: params.model,
      patient_id: params.patientId,
      encounter_id: params.encounterId,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
      latency_ms: params.latencyMs,
    },
    request: params.request,
  });
}

export async function logImpersonationStarted(
  params: {
    tenantId: string;
    impersonatorId: string;
    targetUserId: string;
    sessionId: string;
    reason: string;
    approvedBy: string | null;
    durationMinutes: number;
    request?: AuditRequestContext;
  },
): Promise<void> {
  await logEvent({
    tenantId: params.tenantId,
    actorId: params.impersonatorId,
    impersonatorId: params.impersonatorId,
    eventType: "impersonation.started",
    targetTable: "impersonation_sessions",
    targetRowId: params.sessionId,
    details: {
      target_user_id: params.targetUserId,
      reason: params.reason,
      approved_by: params.approvedBy,
      duration_minutes: params.durationMinutes,
    },
    request: params.request,
  });
}

export async function logImpersonationEnded(
  params: {
    tenantId: string;
    sessionId: string;
    endedBy: string;
    endedByKind: "self" | "admin" | "expired";
    request?: AuditRequestContext;
  },
): Promise<void> {
  await logEvent({
    tenantId: params.tenantId,
    actorId: params.endedBy,
    eventType: "impersonation.ended",
    targetTable: "impersonation_sessions",
    targetRowId: params.sessionId,
    details: {
      ended_by_kind: params.endedByKind,
    },
    request: params.request,
  });
}
