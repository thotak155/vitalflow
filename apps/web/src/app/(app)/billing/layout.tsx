import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import NextLink from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "../../../lib/session.js";

export const dynamic = "force-dynamic";

export default async function BillingLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.permissions.includes("billing:read")) {
    redirect("/?error=Billing+requires+billing%3Aread+permission");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <AppBreadcrumbs items={[{ label: "Billing" }]} />
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Billing</h1>
      </header>

      <nav className="flex gap-1 border-b border-slate-200 text-sm" aria-label="Billing sections">
        <TabLink href="/billing" label="Overview" />
        <TabLink href="/billing/claims" label="Claims" />
        <TabLink href="/billing/denials" label="Denials" />
        <TabLink href="/billing/balances" label="Balances" />
      </nav>

      {children}
    </div>
  );
}

function TabLink({ href, label }: { href: string; label: string }) {
  // Active state will be set via URL-aware CSS when next/navigation usePathname
  // is client-only. For Server Components, we render neutrally and let the
  // browser URL highlight visually via :target or user focus; it's a simple
  // nav so the cost of a pathname check isn't worth a client boundary here.
  return (
    <NextLink
      href={href}
      className="relative rounded-t-md border border-b-0 border-transparent px-3 py-2 text-slate-700 hover:bg-slate-50 aria-[current=page]:border-slate-200 aria-[current=page]:bg-white aria-[current=page]:font-semibold aria-[current=page]:text-slate-900"
    >
      {label}
    </NextLink>
  );
}
