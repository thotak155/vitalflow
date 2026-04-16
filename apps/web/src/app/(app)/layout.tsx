import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ImpersonationBanner } from "../../components/impersonation-banner.js";
import { getSession } from "../../lib/session.js";
import { surfacesFor } from "../../lib/roles.js";

import { AppShell } from "./_shell/app-shell.js";

/**
 * Every page under (app) reads cookies + session — prerendering would
 * serve stale or empty auth state. Force dynamic rendering so Next skips
 * the static export step and renders per-request.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    const hdrs = await headers();
    // Next.js sets x-invoke-path on the current request; fall back to "/" so
    // post-login users land on the provider dashboard.
    const path = hdrs.get("x-invoke-path") ?? hdrs.get("x-pathname") ?? "/";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  const available = surfacesFor(session.userKind, session.roles);

  return (
    <>
      {session.impersonation ? (
        <ImpersonationBanner expiresAt={session.impersonation.expiresAt} />
      ) : null}
      <AppShell
        availableSurfaces={available}
        permissions={session.permissions}
        user={{
          name: session.displayName,
          email: session.email,
          avatarUrl: session.avatarUrl,
        }}
      >
        {children}
      </AppShell>
    </>
  );
}
