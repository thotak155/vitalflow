import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "../../../lib/session.js";
import { SURFACE_HOMES, surfacesFor } from "../../../lib/roles.js";

/**
 * Gate the patient (/my) group. Users without a patient surface are bounced
 * to their default. RLS + scoping queries to their own auth.uid() remains
 * the authoritative boundary.
 */
export default async function MyLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/my");
  }
  const available = surfacesFor(session.userKind, session.roles);
  if (!available.includes("patient")) {
    redirect(SURFACE_HOMES[available[0] ?? "provider"]);
  }
  return <>{children}</>;
}
