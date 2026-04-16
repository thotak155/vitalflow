import type { StaffRole, UserKind } from "@vitalflow/types";

/**
 * The three "surfaces" a unified-app user can land in. These are UX shells,
 * not security boundaries — RLS in Postgres is the real guard.
 */
export type Surface = "provider" | "admin" | "patient";

export const SURFACE_LABELS: Record<Surface, string> = {
  provider: "Care team",
  admin: "Admin console",
  patient: "My health",
};

export const SURFACE_HOMES: Record<Surface, string> = {
  provider: "/",
  admin: "/admin",
  patient: "/my",
};

/**
 * Which staff role primarily maps to which surface. When a staff user carries
 * multiple roles we pick the highest-precedence surface they can see.
 */
const ROLE_TO_SURFACE: Record<StaffRole, Surface> = {
  practice_owner: "admin",
  office_admin: "admin",
  physician: "provider",
  nurse_ma: "provider",
  scheduler: "provider",
  biller: "admin",
};

const SURFACE_PRECEDENCE: Surface[] = ["provider", "admin", "patient"];

/**
 * Compute the surfaces available to a user based on their kind and roles.
 *
 * - `user_kind = 'patient'` → exactly `['patient']`.
 * - `user_kind = 'staff'`   → derived from `tenant_members.roles`.
 * - `user_kind = 'platform'` → none by default; platform admins see the surface
 *   of the user they're impersonating, resolved elsewhere.
 */
export function surfacesFor(kind: UserKind, roles: readonly StaffRole[]): readonly Surface[] {
  if (kind === "patient") {
    return ["patient"];
  }
  if (kind !== "staff") {
    return [];
  }
  const set = new Set<Surface>();
  for (const r of roles) {
    set.add(ROLE_TO_SURFACE[r]);
  }
  return SURFACE_PRECEDENCE.filter((s) => set.has(s));
}

export function defaultSurfaceFor(kind: UserKind, roles: readonly StaffRole[]): Surface {
  return surfacesFor(kind, roles)[0] ?? "provider";
}

/**
 * Which path prefixes belong to which surface. Used by the shell to keep the
 * active surface in sync with the URL.
 */
export function surfaceForPath(pathname: string): Surface {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "admin";
  }
  if (pathname === "/my" || pathname.startsWith("/my/")) {
    return "patient";
  }
  return "provider";
}
