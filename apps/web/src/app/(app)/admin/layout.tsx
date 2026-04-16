import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "../../../lib/session.js";
import { SURFACE_HOMES, surfacesFor } from "../../../lib/roles.js";

/**
 * Gate the admin group. Users without an admin surface (owner/admin/billing)
 * are bounced to their default surface. Defense in depth; Postgres RLS is the
 * authoritative boundary.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/admin");
  }
  const available = surfacesFor(session.userKind, session.roles);
  if (!available.includes("admin")) {
    redirect(SURFACE_HOMES[available[0] ?? "patient"]);
  }
  return <>{children}</>;
}
