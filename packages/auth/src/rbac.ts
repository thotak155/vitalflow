import { forbidden } from "@vitalflow/shared-utils/errors";
import type { Permission, StaffRole, TenantContext, TenantId } from "@vitalflow/types";

/**
 * Role → permission map.
 *
 * MUST stay byte-for-byte identical to the `public.has_permission()` function
 * in supabase/migrations/20260416000014_rbac_redesign.sql. The Postgres
 * function is the authoritative boundary (runs inside RLS); this copy lets
 * server actions fail fast without a round-trip and lets the UI hide actions
 * the user can't perform.
 *
 * If you change this map, update the SQL in the same PR.
 */
const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  practice_owner: [
    "clinical:read",
    "clinical:write",
    "clinical:sign",
    "clinical:amend",
    "patient:read",
    "patient:write",
    "rx:create",
    "rx:sign",
    "rx:refill",
    "order:create",
    "order:resolve",
    "schedule:read",
    "schedule:write",
    "billing:read",
    "billing:write",
    "billing:collect",
    "billing:adjust",
    "billing:write_off",
    "charges:capture",
    "admin:tenant",
    "admin:users",
    "admin:billing_config",
    "admin:integrations",
    "audit:read",
    "ai:invoke",
  ],
  office_admin: [
    "admin:tenant",
    "admin:users",
    "admin:billing_config",
    "admin:integrations",
    "billing:read",
    "billing:write",
    "billing:collect",
    "billing:adjust",
    "billing:write_off",
    "charges:capture",
    "schedule:read",
    "schedule:write",
    "patient:read",
    "patient:write",
    "audit:read",
  ],
  physician: [
    "clinical:read",
    "clinical:write",
    "clinical:sign",
    "clinical:amend",
    "patient:read",
    "patient:write",
    "rx:create",
    "rx:sign",
    "rx:refill",
    "order:create",
    "order:resolve",
    "schedule:read",
    "charges:capture",
    "ai:invoke",
  ],
  nurse_ma: [
    "clinical:read",
    "clinical:write",
    "patient:read",
    "patient:write",
    "order:create",
    "schedule:read",
    "charges:capture",
    "ai:invoke",
  ],
  scheduler: ["schedule:read", "schedule:write", "patient:read", "patient:demographics_only"],
  biller: [
    "billing:read",
    "billing:write",
    "billing:collect",
    "billing:adjust",
    "billing:write_off",
    "charges:capture",
    "clinical:read",
    "patient:read",
  ],
};

/**
 * Permissions stripped from an effective set while the caller is impersonating.
 *
 * Policy: impersonators can read almost everything but cannot mutate clinical
 * or financial state on behalf of a practice. Every write-capable permission
 * here means "impersonators cannot perform this action even if the target
 * user could." See docs/security-architecture.md §impersonation.
 *
 * When adding a new write permission, ask: "should a support engineer acting
 * as a physician / biller be able to perform this?" If no → add it here.
 */
const IMPERSONATION_BLOCKED: readonly Permission[] = [
  // Clinical writes
  "clinical:write",
  "clinical:sign",
  "clinical:amend",
  "rx:create",
  "rx:sign",
  "rx:refill",
  "order:create",
  "order:resolve",
  // Billing writes (including charge capture via the scoped permission)
  "billing:write",
  "billing:collect",
  "billing:adjust",
  "billing:write_off",
  "charges:capture",
  // Admin user mgmt
  "admin:users",
];

/** Patient self-service permissions (granted only to user_kind=patient). */
const PATIENT_PERMISSIONS: readonly Permission[] = [
  "self:read",
  "self:write",
  "self:message_care_team",
  "self:book_appointment",
];

/**
 * Expand a role set to its effective permission set, applying impersonation
 * stripping if applicable.
 */
export function permissionsFor(
  roles: readonly StaffRole[],
  opts: { impersonating?: boolean } = {},
): readonly Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role]) {
      set.add(p);
    }
  }
  if (opts.impersonating) {
    for (const p of IMPERSONATION_BLOCKED) {
      set.delete(p);
    }
  }
  return [...set];
}

/** Permissions granted to a verified patient portal user. */
export function patientPermissions(): readonly Permission[] {
  return PATIENT_PERMISSIONS;
}

export function hasPermission(ctx: TenantContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}

export function hasAnyPermission(ctx: TenantContext, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => ctx.permissions.includes(p));
}

export function hasAllPermissions(ctx: TenantContext, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => ctx.permissions.includes(p));
}

export function requirePermission(ctx: TenantContext, permission: Permission): void {
  if (!hasPermission(ctx, permission)) {
    throw forbidden(
      `Missing permission '${permission}' for tenant ${ctx.tenantId satisfies TenantId}`,
    );
  }
}

export function requireAllPermissions(
  ctx: TenantContext,
  permissions: readonly Permission[],
): void {
  const missing = permissions.filter((p) => !ctx.permissions.includes(p));
  if (missing.length > 0) {
    throw forbidden(`Missing permissions: ${missing.join(", ")}`);
  }
}

export { ROLE_PERMISSIONS, IMPERSONATION_BLOCKED, PATIENT_PERMISSIONS };
