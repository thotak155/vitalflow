import { z } from "zod";

import { forbidden, validation } from "@vitalflow/shared-utils/errors";
import type { TenantId, UserId } from "@vitalflow/types";

import type { SupabaseServerClient } from "./server.js";

/**
 * Narrowed RPC shim. `SupabaseServerClient` is `ReturnType<typeof
 * createServerClient<Database>>`, whose `.rpc()` overloads don't always
 * surface Database["public"]["Functions"] entries through the `ReturnType`
 * inference boundary. Rather than pollute call sites, centralize the cast
 * here — the SQL functions are authoritative (see migrations 0014, 0015).
 */
type RpcFn = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
function rpc(client: SupabaseServerClient): RpcFn {
  return (fn, args) => (client as unknown as { rpc: RpcFn }).rpc(fn, args);
}

/**
 * Impersonation is the riskiest path in the system. Every helper here is thin
 * on purpose — policy lives in SQL (triggers + RPC) where it can't be skipped
 * by a caller who forgot to call the TS helper.
 *
 * See docs/security-architecture.md §7 for rules.
 */

export const ImpersonationStartRequestSchema = z.object({
  tenantId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  reason: z.string().min(20).max(2000),
  approvedBy: z.string().uuid().optional(), // required in prod by RPC
  durationMinutes: z.number().int().min(5).max(240).default(60),
});
export type ImpersonationStartRequest = z.infer<typeof ImpersonationStartRequestSchema>;

export interface ImpersonationSession {
  sessionId: string;
  impersonatorId: UserId;
  targetUserId: UserId;
  tenantId: TenantId;
  startedAt: string;
  expiresAt: string;
}

/**
 * Request a new impersonation session. The RPC server-side enforces:
 *   - caller is a super_admin
 *   - target is `user_kind = 'staff'`
 *   - reason has min length
 *   - in production: `approved_by` is another super_admin
 *   - expires_at ≤ started_at + 4h
 */
export async function startImpersonation(
  client: SupabaseServerClient,
  request: ImpersonationStartRequest,
): Promise<ImpersonationSession> {
  const parsed = ImpersonationStartRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw validation("Invalid impersonation request", { issues: parsed.error.flatten() });
  }
  // The RPC is created in a follow-up migration. Shape kept here so call sites
  // compile today.
  const { data, error } = await rpc(client)("impersonate_start", {
    p_tenant_id: parsed.data.tenantId,
    p_target_user_id: parsed.data.targetUserId,
    p_reason: parsed.data.reason,
    p_approved_by: parsed.data.approvedBy ?? null,
    p_duration_minutes: parsed.data.durationMinutes,
  });
  if (error) {
    throw forbidden(`Impersonation denied: ${error.message}`);
  }
  return data as unknown as ImpersonationSession;
}

export async function endImpersonation(
  client: SupabaseServerClient,
  sessionId: string,
  reason?: string,
): Promise<void> {
  const { error } = await rpc(client)("impersonate_end", {
    p_session_id: sessionId,
    p_reason: reason ?? null,
  });
  if (error) {
    throw forbidden(`Failed to end impersonation: ${error.message}`);
  }
}

/**
 * Read the currently active impersonation session, if any. Calls the
 * `public.current_impersonation()` SQL function which filters by auth.uid()
 * and revoked_at.
 */
export async function getActiveImpersonation(
  client: SupabaseServerClient,
): Promise<ImpersonationSession | null> {
  const { data, error } = await rpc(client)("current_impersonation");
  if (error || !data) {
    return null;
  }
  if (Array.isArray(data) && data.length === 0) {
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }
  const r = row as {
    session_id: string;
    impersonator_id: string;
    target_user_id: string;
    tenant_id: string;
    expires_at: string;
  };
  return {
    sessionId: r.session_id,
    impersonatorId: r.impersonator_id as UserId,
    targetUserId: r.target_user_id as UserId,
    tenantId: r.tenant_id as TenantId,
    startedAt: new Date().toISOString(),
    expiresAt: r.expires_at,
  };
}
