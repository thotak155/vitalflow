import { getActiveImpersonation } from "@vitalflow/auth/impersonation";
import { patientPermissions, permissionsFor } from "@vitalflow/auth/rbac";
import { createVitalFlowServerClient, type SupabaseServerClient } from "@vitalflow/auth/server";
import type {
  Permission,
  StaffRole,
  TenantContext,
  TenantId,
  UserId,
  UserKind,
} from "@vitalflow/types";

export interface AppSession extends TenantContext {
  displayName: string;
  email: string;
  avatarUrl?: string;
}

/**
 * Dev stub kept behind an env flag so scaffold work can continue without a
 * real Supabase session. Set `VITALFLOW_DEV_SESSION=true` to enable.
 */
const DEV_STUB_ROLES: readonly StaffRole[] = ["practice_owner", "physician"];
function devStubSession(): AppSession {
  return {
    userId: "00000000-0000-0000-0000-000000000001" as UserId,
    tenantId: "00000000-0000-0000-0000-000000000002" as TenantId,
    userKind: "staff" satisfies UserKind,
    roles: DEV_STUB_ROLES,
    permissions: permissionsFor(DEV_STUB_ROLES, { impersonating: false }),
    displayName: "Dr. Jamie Rivera (dev)",
    email: "jamie.rivera@demo.vitalflow.health",
  };
}

/**
 * Authoritative session resolver used by every protected Server Component
 * and Server Action. Returns `null` when the caller is unauthenticated or
 * when the user has no actionable membership yet — callers handle the
 * redirect to /login themselves (the (app) root layout does this centrally).
 *
 * Branches:
 *   1. No Supabase user            → null
 *   2. profile.user_kind = staff   → first non-deleted tenant_members row
 *   3. profile.user_kind = patient → first verified patient_portal_link
 *   4. profile.user_kind = platform → null (must impersonate to get a tenant ctx)
 *   5. Active impersonation       → rebuilds context using target's roles + tenant
 */
export async function getSession(): Promise<AppSession | null> {
  if (process.env.VITALFLOW_DEV_SESSION === "true") {
    return devStubSession();
  }

  const supabase = await createVitalFlowServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return null;
  }

  // `supabase-js`'s `.from()` generics don't always re-infer typed rows through
  // the `@supabase/ssr` wrapper's return type. Cast row shapes explicitly —
  // the columns we select are fixed and small, and the DB is the source of
  // truth regardless.
  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, user_kind")
    .eq("id", auth.user.id)
    .maybeSingle();
  const profile = profileRaw as ProfileRow | null;
  if (!profile) {
    return null;
  }

  const impersonation = await getActiveImpersonation(supabase);

  if (profile.user_kind === "staff") {
    return resolveStaffSession(supabase, profile, impersonation);
  }
  if (profile.user_kind === "patient") {
    return resolvePatientSession(supabase, profile);
  }
  // platform + service users have no default tenant — they must impersonate.
  return null;
}

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  user_kind: UserKind;
};

type MembershipRow = {
  tenant_id: string;
  roles: StaffRole[] | null;
  joined_at?: string;
};

type PortalLinkRow = {
  tenant_id: string;
  patient_id: string;
  verified_at: string | null;
};

async function resolveStaffSession(
  supabase: SupabaseServerClient,
  profile: ProfileRow,
  impersonation: Awaited<ReturnType<typeof getActiveImpersonation>>,
): Promise<AppSession | null> {
  let tenantId: string | undefined;
  let roles: StaffRole[] = [];

  if (impersonation) {
    tenantId = impersonation.tenantId;
    const { data: targetRaw } = await supabase
      .from("tenant_members")
      .select("tenant_id, roles")
      .eq("user_id", impersonation.targetUserId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();
    const target = targetRaw as Pick<MembershipRow, "roles"> | null;
    roles = target?.roles ?? [];
  } else {
    const { data: membershipsRaw } = await supabase
      .from("tenant_members")
      .select("tenant_id, roles, joined_at")
      .eq("user_id", profile.id)
      .is("deleted_at", null)
      .order("joined_at", { ascending: true })
      .limit(1);
    const memberships = membershipsRaw as MembershipRow[] | null;
    const m = memberships?.[0];
    if (!m) {
      // Staff user with no membership — invited but not yet attached, or
      // newly-deactivated. Treated as unauthenticated for now; a future
      // /onboarding page will accept invites.
      return null;
    }
    tenantId = m.tenant_id;
    roles = m.roles ?? [];
  }

  if (!tenantId) {
    return null;
  }

  const permissions: readonly Permission[] = permissionsFor(roles, {
    impersonating: !!impersonation,
  });

  return {
    userId: profile.id as UserId,
    tenantId: tenantId as TenantId,
    userKind: "staff",
    roles,
    permissions,
    displayName: profile.full_name ?? profile.email,
    email: profile.email,
    avatarUrl: profile.avatar_url ?? undefined,
    impersonation: impersonation
      ? {
          sessionId: impersonation.sessionId,
          impersonatorId: impersonation.impersonatorId,
          expiresAt: impersonation.expiresAt,
        }
      : undefined,
  };
}

async function resolvePatientSession(
  supabase: SupabaseServerClient,
  profile: ProfileRow,
): Promise<AppSession | null> {
  const { data: linksRaw } = await supabase
    .from("patient_portal_links")
    .select("tenant_id, patient_id, verified_at")
    .eq("user_id", profile.id)
    .is("deleted_at", null)
    .not("verified_at", "is", null)
    .limit(1);
  const links = linksRaw as PortalLinkRow[] | null;
  const link = links?.[0];
  if (!link) {
    return null;
  }
  return {
    userId: profile.id as UserId,
    tenantId: link.tenant_id as TenantId,
    userKind: "patient",
    roles: [],
    permissions: patientPermissions(),
    displayName: profile.full_name ?? profile.email,
    email: profile.email,
    avatarUrl: profile.avatar_url ?? undefined,
  };
}
