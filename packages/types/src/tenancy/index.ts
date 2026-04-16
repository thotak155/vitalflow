import { z } from "zod";

// ---------- IDs --------------------------------------------------------------

export const TenantIdSchema = z.string().uuid().brand<"TenantId">();
export type TenantId = z.infer<typeof TenantIdSchema>;

export const UserIdSchema = z.string().uuid().brand<"UserId">();
export type UserId = z.infer<typeof UserIdSchema>;

// ---------- User kind (hard separation: staff / patient / platform / service)

export const UserKindSchema = z.enum(["staff", "patient", "platform", "service"]);
export type UserKind = z.infer<typeof UserKindSchema>;

// ---------- Roles ------------------------------------------------------------

/** Per-practice staff roles. Stored in `tenant_members.roles[]`. */
export const StaffRoleSchema = z.enum([
  "practice_owner",
  "office_admin",
  "physician",
  "nurse_ma",
  "scheduler",
  "biller",
]);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

/** Platform-level roles. Stored in `platform_admins.role`. Not tenant-scoped. */
export const PlatformRoleSchema = z.enum(["super_admin"]);
export type PlatformRole = z.infer<typeof PlatformRoleSchema>;

/** Deprecated alias kept for call sites still importing `Role`. New code should use `StaffRole`. */
export type Role = StaffRole;

// ---------- Permissions -----------------------------------------------------

export const PermissionSchema = z.enum([
  // Clinical
  "clinical:read",
  "clinical:write",
  "clinical:sign",
  "clinical:amend",
  // Patient
  "patient:read",
  "patient:write",
  "patient:demographics_only",
  // Rx
  "rx:create",
  "rx:sign",
  "rx:refill",
  // Orders
  "order:create",
  "order:resolve",
  // Schedule
  "schedule:read",
  "schedule:write",
  // Billing
  "billing:read",
  "billing:write",
  "billing:collect",
  "billing:adjust",
  "billing:write_off",
  // Admin
  "admin:tenant",
  "admin:users",
  "admin:billing_config",
  "admin:integrations",
  // Audit
  "audit:read",
  // AI
  "ai:invoke",
  "ai:train",
  // Patient self-service (only granted to kind=patient via patient_portal_links)
  "self:read",
  "self:write",
  "self:message_care_team",
  "self:book_appointment",
]);
export type Permission = z.infer<typeof PermissionSchema>;

// ---------- Tenant -----------------------------------------------------------

export const TenantSchema = z.object({
  id: TenantIdSchema,
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).max(128),
  plan: z.enum(["starter", "growth", "enterprise"]),
  region: z.enum(["us-east-1", "us-west-2", "eu-west-1", "ap-south-1"]),
  hipaaBaaSigned: z.boolean(),
  createdAt: z.string().datetime(),
});
export type Tenant = z.infer<typeof TenantSchema>;

// ---------- Session context --------------------------------------------------

/**
 * Authoritative session context used by server-side guards. For staff users
 * this is derived from `tenant_members`; for patient users from
 * `patient_portal_links`; for platform users from `platform_admins` +
 * `impersonation_sessions`.
 */
export interface TenantContext {
  tenantId: TenantId;
  userId: UserId;
  userKind: UserKind;
  /** Staff roles active in this tenant (empty for patient/platform/service). */
  roles: readonly StaffRole[];
  /** Pre-expanded permission set for the current tenant. */
  permissions: readonly Permission[];
  /** Non-null while the caller is impersonating a staff user. */
  impersonation?: {
    sessionId: string;
    impersonatorId: UserId;
    expiresAt: string;
  };
}
