import { Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import NextLink from "next/link";
import type { ReactNode } from "react";

/**
 * Branded placeholder for V1 routes whose UI hasn't been built yet. Keeps
 * nav links clickable (no 404 / no "outside the shell" feel) and signals
 * roadmap status clearly.
 *
 * Props intentionally minimal — this is only used from route-level stubs.
 */
export interface ComingSoonProps {
  readonly title: string;
  readonly breadcrumb?: string;
  readonly lede?: string;
  readonly bullets?: readonly string[];
  readonly relatedLinks?: ReadonlyArray<{ label: string; href: string }>;
  readonly milestone?: string;
}

export function ComingSoon({
  title,
  breadcrumb,
  lede,
  bullets = [],
  relatedLinks = [],
  milestone,
}: ComingSoonProps): ReactNode {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <AppBreadcrumbs items={[{ label: breadcrumb ?? title }]} />
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {milestone ? (
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">{milestone}</p>
        ) : null}
      </header>

      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-base">Coming in a follow-up milestone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-800">
          {lede ? <p>{lede}</p> : null}

          {bullets.length > 0 ? (
            <>
              <p className="font-medium">When it lands, it will include:</p>
              <ul className="ml-4 list-disc space-y-1 text-slate-700">
                {bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </>
          ) : null}

          {relatedLinks.length > 0 ? (
            <div className="pt-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Related today
              </p>
              <ul className="space-y-1">
                {relatedLinks.map((l) => (
                  <li key={l.href}>
                    <NextLink href={l.href} className="text-sky-700 underline">
                      {l.label} →
                    </NextLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
