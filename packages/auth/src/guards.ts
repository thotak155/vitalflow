import { forbidden, unauthenticated } from "@vitalflow/shared-utils/errors";
import type { Permission, TenantContext, UserKind } from "@vitalflow/types";

import { hasPermission } from "./rbac.js";

/**
 * Server-side guards. Call at the top of every protected Server Component,
 * Server Action, or Route Handler. All throw typed errors (`VitalFlowError`)
 * with proper HTTP status; the Next.js error boundary renders 401/403 pages.
 *
 * These are defense-in-depth. Postgres RLS is the real boundary.
 */

export interface SessionResolver {
  (): Promise<TenantContext | null>;
}

/**
 * Resolve the current session or throw 401. Prefer passing in an explicit
 * resolver so this package stays decoupled from the Next.js cookie store.
 */
export async function requireSession(resolver: SessionResolver): Promise<TenantContext> {
  const ctx = await resolver();
  if (!ctx) {
    throw unauthenticated();
  }
  return ctx;
}

/** Throws 403 if the user's kind is not in the allow-list. */
export function requireUserKind(ctx: TenantContext, allowed: readonly UserKind[]): TenantContext {
  if (!allowed.includes(ctx.userKind)) {
    throw forbidden(`Surface requires user kind in [${allowed.join(", ")}] (got ${ctx.userKind})`);
  }
  return ctx;
}

export type Surface = "provider" | "admin" | "patient";

const SURFACE_USER_KINDS: Record<Surface, readonly UserKind[]> = {
  provider: ["staff"],
  admin: ["staff"],
  patient: ["patient"],
};

const SURFACE_PERMISSIONS: Record<Surface, readonly Permission[]> = {
  provider: ["clinical:read"],
  admin: ["admin:tenant"],
  patient: ["self:read"],
};

/**
 * Gate a surface group (matches the route-group layouts in apps/web). Checks
 * both user_kind and a representative permission.
 */
export function requireSurface(ctx: TenantContext, surface: Surface): TenantContext {
  requireUserKind(ctx, SURFACE_USER_KINDS[surface]);
  // The permission check is cheap — it's a set lookup — but it guarantees
  // we catch role/permission drift where kind is staff but no useful role is held.
  const anyPermission = SURFACE_PERMISSIONS[surface].some((p) => hasPermission(ctx, p));
  if (!anyPermission) {
    throw forbidden(`No permissions for the ${surface} surface`);
  }
  return ctx;
}

/**
 * Throws 403 when the caller is currently impersonating. Use before sensitive
 * writes (signing, Rx, financial adjustments) where impersonation must not
 * proxy the action. The Postgres `has_permission()` already strips these
 * permissions while impersonating; this guard surfaces a clearer error.
 */
export function requireNoImpersonation(ctx: TenantContext): TenantContext {
  if (ctx.impersonation) {
    throw forbidden("This action cannot be performed while impersonating");
  }
  return ctx;
}

export function isImpersonating(ctx: TenantContext): boolean {
  return ctx.impersonation !== undefined;
}
