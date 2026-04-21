import { forbidden, unauthenticated } from "@vitalflow/shared-utils/errors";
import type { StaffRole, TenantContext, UserKind } from "@vitalflow/types";

/**
 * VitalFlow V1 module-level permission system — DESIGN-STAGE.
 *
 * This file defines the proposed V1 permission matrix per
 * `docs/permissions-matrix.md`. It is NOT yet wired into route guards or
 * SQL — `rbac.ts` is still authoritative at runtime. Use this module only
 * from new code that has opted in, and in tests.
 *
 * Migration plan: see `docs/permissions-matrix.md` §10.
 */

// ---------- Modules & actions -----------------------------------------------

export const MODULES = [
  "patient_records",
  "appointments",
  "encounters",
  "notes",
  "clinical_lists",
  "intake_forms",
  "check_in",
  "billing_dashboard",
  "claims",
  "denials",
  "billing",
  "staff_records",
  "credentials",
  "tasks",
  "inventory",
  "admin_settings",
  "audit_logs",
  "entitlements",
  "self",
  "platform",
  "ai",
] as const;

export type Module = (typeof MODULES)[number];

export const ACTIONS = [
  "view",
  "create",
  "update",
  "delete",
  "sign",
  "amend",
  "export",
  "assign",
  "approve",
  "submit",
  "manage",
  // Self-service (patient)
  "read",
  "write",
  "message_care_team",
  "book_appointment",
  // Billing-specific
  "adjust",
  "write_off",
  // AI
  "invoke",
  "train",
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * A permission key — `module:action`. The full valid set is enumerated in
 * `PERMISSIONS_V2` below; not every (module, action) pair is valid.
 */
export type PermissionV2 = `${Module}:${Action}`;

// ---------- Valid permissions (enumerated) ----------------------------------

/**
 * The canonical list of every permission key recognized by V1. Narrower than
 * the full `Module × Action` cross product — only the pairs that mean
 * something in the product surface here.
 */
export const PERMISSIONS_V2 = [
  // Patient records
  "patient_records:view",
  "patient_records:create",
  "patient_records:update",
  "patient_records:delete",
  "patient_records:export",
  // Appointments
  "appointments:view",
  "appointments:create",
  "appointments:update",
  "appointments:delete",
  "appointments:assign",
  // Encounters
  "encounters:view",
  "encounters:create",
  "encounters:update",
  "encounters:sign",
  "encounters:amend",
  // Notes
  "notes:view",
  "notes:create",
  "notes:update",
  "notes:sign",
  "notes:amend",
  "notes:export",
  // Clinical lists (problems/allergies/meds)
  "clinical_lists:view",
  "clinical_lists:update",
  "clinical_lists:sign",
  // Front office
  "intake_forms:view",
  "intake_forms:create",
  "intake_forms:update",
  "check_in:view",
  "check_in:update",
  // Revenue cycle
  "billing_dashboard:view",
  "claims:view",
  "claims:create",
  "claims:update",
  "claims:submit",
  "claims:approve",
  "claims:export",
  "denials:view",
  "denials:update",
  "denials:approve",
  "billing:adjust",
  "billing:write_off",
  // Administration
  "staff_records:view",
  "staff_records:create",
  "staff_records:update",
  "staff_records:manage",
  "credentials:view",
  "credentials:update",
  "credentials:approve",
  "tasks:view",
  "tasks:create",
  "tasks:update",
  "tasks:assign",
  "inventory:view",
  "inventory:update",
  "inventory:manage",
  // Platform & audit
  "admin_settings:view",
  "admin_settings:update",
  "admin_settings:manage",
  "audit_logs:view",
  "audit_logs:export",
  "entitlements:view",
  "entitlements:manage",
  // Patient self-service
  "self:read",
  "self:write",
  "self:message_care_team",
  "self:book_appointment",
  // AI (cross-cutting)
  "ai:invoke",
  "ai:train",
] as const satisfies readonly PermissionV2[];

export type PermissionV2Key = (typeof PERMISSIONS_V2)[number];

const PERMISSION_SET = new Set<PermissionV2Key>(PERMISSIONS_V2);

export function isPermissionV2(value: string): value is PermissionV2Key {
  return PERMISSION_SET.has(value as PermissionV2Key);
}

// ---------- Role → permission map -------------------------------------------

/**
 * Role → permission map. Derived from `docs/permissions-matrix.md` §4.
 * Conditional cells (🟡 / ★ in the matrix) are handled in helpers below
 * rather than by duplicating rows — e.g. impersonation stripping is applied
 * post-expansion, threshold gating on write-offs is enforced server-side.
 *
 * Reminder: super_admin is a PLATFORM role, not a staff role. It gets
 * everything via `platformAdminPermissions()` below.
 */
export const ROLE_PERMISSIONS_V2: Record<StaffRole, readonly PermissionV2Key[]> = {
  practice_owner: [
    "patient_records:view",
    "patient_records:create",
    "patient_records:update",
    "patient_records:export",
    "appointments:view",
    "appointments:create",
    "appointments:update",
    "appointments:delete",
    "appointments:assign",
    "encounters:view",
    "encounters:create",
    "encounters:update",
    "encounters:sign",
    "encounters:amend",
    "notes:view",
    "notes:create",
    "notes:update",
    "notes:sign",
    "notes:amend",
    "notes:export",
    "clinical_lists:view",
    "clinical_lists:update",
    "clinical_lists:sign",
    "intake_forms:view",
    "intake_forms:create",
    "intake_forms:update",
    "check_in:view",
    "check_in:update",
    "billing_dashboard:view",
    "claims:view",
    "claims:create",
    "claims:update",
    "claims:submit",
    "claims:approve",
    "claims:export",
    "denials:view",
    "denials:update",
    "denials:approve",
    "billing:adjust",
    "billing:write_off",
    "staff_records:view",
    "staff_records:create",
    "staff_records:update",
    "staff_records:manage",
    "credentials:view",
    "credentials:update",
    "credentials:approve",
    "tasks:view",
    "tasks:create",
    "tasks:update",
    "tasks:assign",
    "inventory:view",
    "inventory:update",
    "inventory:manage",
    "admin_settings:view",
    "admin_settings:update",
    "admin_settings:manage",
    "audit_logs:view",
    "audit_logs:export",
    "entitlements:view",
    "ai:invoke",
  ],
  office_admin: [
    "patient_records:view",
    "patient_records:create",
    "patient_records:update",
    "patient_records:export",
    "appointments:view",
    "appointments:create",
    "appointments:update",
    "appointments:delete",
    "appointments:assign",
    "encounters:view",
    "notes:view",
    "notes:export",
    "intake_forms:view",
    "intake_forms:create",
    "intake_forms:update",
    "check_in:view",
    "check_in:update",
    "billing_dashboard:view",
    "claims:view",
    "claims:create",
    "claims:update",
    "claims:submit",
    "claims:export",
    "denials:view",
    "denials:update",
    "staff_records:view",
    "staff_records:create",
    "staff_records:update",
    "staff_records:manage",
    "credentials:view",
    "credentials:update",
    "tasks:view",
    "tasks:create",
    "tasks:update",
    "tasks:assign",
    "inventory:view",
    "inventory:update",
    "inventory:manage",
    "admin_settings:view",
    "admin_settings:update",
    "audit_logs:view",
    "entitlements:view",
  ],
  physician: [
    "patient_records:view",
    "patient_records:create",
    "patient_records:update",
    "appointments:view",
    "encounters:view",
    "encounters:create",
    "encounters:update",
    "encounters:sign",
    "encounters:amend",
    "notes:view",
    "notes:create",
    "notes:update",
    "notes:sign",
    "notes:amend",
    "clinical_lists:view",
    "clinical_lists:update",
    "clinical_lists:sign",
    "intake_forms:view",
    "check_in:view",
    "credentials:view",
    "credentials:update",
    "tasks:view",
    "tasks:create",
    "tasks:update",
    "tasks:assign",
    "ai:invoke",
  ],
  nurse_ma: [
    "patient_records:view",
    "patient_records:create",
    "patient_records:update",
    "appointments:view",
    "encounters:view",
    "encounters:create",
    "encounters:update",
    "notes:view",
    "notes:create",
    "notes:update",
    "clinical_lists:view",
    "clinical_lists:update",
    "intake_forms:view",
    "check_in:view",
    "check_in:update",
    "credentials:view",
    "credentials:update",
    "tasks:view",
    "tasks:create",
    "tasks:update",
    "inventory:view",
    "inventory:update",
    "ai:invoke",
  ],
  scheduler: [
    "patient_records:view",
    "patient_records:create",
    "patient_records:update",
    "appointments:view",
    "appointments:create",
    "appointments:update",
    "appointments:delete",
    "appointments:assign",
    "intake_forms:view",
    "intake_forms:create",
    "intake_forms:update",
    "check_in:view",
    "check_in:update",
    "tasks:view",
    "tasks:create",
    "tasks:update",
    "tasks:assign",
  ],
  biller: [
    "patient_records:view",
    "encounters:view",
    "notes:view",
    "billing_dashboard:view",
    "claims:view",
    "claims:create",
    "claims:update",
    "claims:submit",
    "claims:export",
    "denials:view",
    "denials:update",
    "billing:adjust",
    "billing:write_off",
    "tasks:view",
    "tasks:create",
    "tasks:update",
    "tasks:assign",
  ],
};

/** Permission set granted to a verified patient portal user (not a staff role). */
export const PATIENT_PERMISSIONS_V2 = [
  "patient_records:view",
  "patient_records:update",
  "appointments:view",
  "appointments:create",
  "appointments:update",
  "intake_forms:view",
  "intake_forms:update",
  "check_in:view",
  "check_in:update",
  "encounters:view",
  "notes:view",
  "clinical_lists:view",
  "self:read",
  "self:write",
  "self:message_care_team",
  "self:book_appointment",
] as const satisfies readonly PermissionV2Key[];

/**
 * Permissions stripped while the caller is impersonating. Matches
 * `IMPERSONATION_BLOCKED` in rbac.ts conceptually but targets V2 keys.
 * See `docs/permissions-matrix.md` §7 and §9.
 */
export const IMPERSONATION_BLOCKED_V2: readonly PermissionV2Key[] = [
  "encounters:sign",
  "encounters:amend",
  "notes:sign",
  "notes:amend",
  "clinical_lists:sign",
  "claims:approve",
  "denials:approve",
  "credentials:approve",
  "billing:adjust",
  "billing:write_off",
  "staff_records:manage",
  "admin_settings:manage",
  "audit_logs:export",
  "patient_records:export",
  "notes:export",
  "claims:export",
  "entitlements:manage",
];

// ---------- Helpers ---------------------------------------------------------

/**
 * Expand a role set to its effective V2 permission set, applying impersonation
 * stripping if applicable. `user_kind` narrows which permissions are reachable:
 * patient kinds get PATIENT_PERMISSIONS_V2; platform kinds get nothing by
 * themselves (super_admin access flows through impersonation).
 */
export function permissionsForRolesV2(
  roles: readonly StaffRole[],
  opts: { impersonating?: boolean; userKind?: UserKind } = {},
): readonly PermissionV2Key[] {
  if (opts.userKind === "patient") {
    return [...PATIENT_PERMISSIONS_V2];
  }
  const set = new Set<PermissionV2Key>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS_V2[role]) {
      set.add(p);
    }
  }
  if (opts.impersonating) {
    for (const p of IMPERSONATION_BLOCKED_V2) {
      set.delete(p);
    }
  }
  return [...set];
}

/** Platform-admin permission set — all permissions. Gated by impersonation. */
export function platformAdminPermissions(): readonly PermissionV2Key[] {
  return PERMISSIONS_V2;
}

export function hasPermissionV2(ctx: TenantContext, perm: PermissionV2Key): boolean {
  // `ctx.permissions` is typed as `readonly Permission[]` (V1) today; after
  // migration it will be `readonly PermissionV2Key[]`. Until then, call sites
  // using this helper should have already switched the session resolver over.
  return (ctx.permissions as readonly string[]).includes(perm);
}

export function hasAnyPermissionV2(ctx: TenantContext, perms: readonly PermissionV2Key[]): boolean {
  return perms.some((p) => hasPermissionV2(ctx, p));
}

export function hasAllPermissionsV2(
  ctx: TenantContext,
  perms: readonly PermissionV2Key[],
): boolean {
  return perms.every((p) => hasPermissionV2(ctx, p));
}

export function requirePermissionV2(ctx: TenantContext, perm: PermissionV2Key): void {
  if (!hasPermissionV2(ctx, perm)) {
    throw forbidden(`Missing permission '${perm}'`);
  }
}

export function requireAllPermissionsV2(
  ctx: TenantContext,
  perms: readonly PermissionV2Key[],
): void {
  const missing = perms.filter((p) => !hasPermissionV2(ctx, p));
  if (missing.length > 0) {
    throw forbidden(`Missing permissions: ${missing.join(", ")}`);
  }
}

export function requireAnyPermissionV2(
  ctx: TenantContext,
  perms: readonly PermissionV2Key[],
): void {
  if (!hasAnyPermissionV2(ctx, perms)) {
    throw forbidden(`Requires one of: ${perms.join(", ")}`);
  }
}

export function requireSessionV2(ctx: TenantContext | null): TenantContext {
  if (!ctx) {
    throw unauthenticated();
  }
  return ctx;
}

/**
 * Returns the allowed actions for a given module based on the caller's role
 * set. Useful for rendering action buttons (create/update/delete) without
 * writing N separate `hasPermissionV2` calls.
 */
export function filterModuleActions(
  roles: readonly StaffRole[],
  module: Module,
  opts: { impersonating?: boolean; userKind?: UserKind } = {},
): readonly Action[] {
  const perms = permissionsForRolesV2(roles, opts);
  const prefix = `${module}:`;
  const actions = new Set<Action>();
  for (const p of perms) {
    if (p.startsWith(prefix)) {
      actions.add(p.slice(prefix.length) as Action);
    }
  }
  return [...actions];
}

/**
 * Route-meta shape referenced by pages/actions. Kept minimal on purpose —
 * the page declares what it needs; the guard decides pass/fail.
 */
export interface RouteMetaV2 {
  surface: "provider" | "admin" | "patient" | "platform";
  requires?: readonly PermissionV2Key[];
  requiresAll?: readonly PermissionV2Key[];
  impersonationAllowed?: boolean;
}

export function checkRouteMeta(ctx: TenantContext, meta: RouteMetaV2): void {
  if (meta.requires && meta.requires.length > 0) {
    requireAnyPermissionV2(ctx, meta.requires);
  }
  if (meta.requiresAll && meta.requiresAll.length > 0) {
    requireAllPermissionsV2(ctx, meta.requiresAll);
  }
  if (meta.impersonationAllowed === false && ctx.impersonation) {
    throw forbidden("This route cannot be accessed while impersonating");
  }
}
