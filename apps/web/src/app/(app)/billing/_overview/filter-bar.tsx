import { Button, Card, CardContent, FormField, Input } from "@vitalflow/ui";
import NextLink from "next/link";

import type { ProviderOption } from "../../../../lib/billing-overview-context.js";

/**
 * Dashboard filter bar: date range + provider.
 *
 * Pure `<form method="GET">` — no JS. Preset links set `?range=...` which
 * the server-side resolver translates into concrete from/to dates.
 */
export function OverviewFilterBar({
  from,
  to,
  providerId,
  activePreset,
  providers,
}: {
  from: string;
  to: string;
  providerId?: string;
  activePreset?: string;
  providers: readonly ProviderOption[];
}) {
  const presetClass = (key: string) =>
    `rounded-md border px-2.5 py-1 text-xs ${
      activePreset === key
        ? "border-slate-800 bg-slate-900 text-white"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Presets:</span>
          <NextLink href="/billing?range=today" className={presetClass("today")}>
            Today
          </NextLink>
          <NextLink href="/billing?range=7d" className={presetClass("7d")}>
            Last 7 days
          </NextLink>
          <NextLink href="/billing?range=30d" className={presetClass("30d")}>
            Last 30 days
          </NextLink>
          <NextLink href="/billing?range=mtd" className={presetClass("mtd")}>
            Month to date
          </NextLink>
        </div>

        <form method="GET" className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <FormField label="From" htmlFor="ov-from">
            <Input id="ov-from" type="date" name="from" defaultValue={from} />
          </FormField>
          <FormField label="To" htmlFor="ov-to">
            <Input id="ov-to" type="date" name="to" defaultValue={to} />
          </FormField>
          <FormField label="Provider" htmlFor="ov-provider">
            <select
              id="ov-provider"
              name="provider"
              defaultValue={providerId ?? ""}
              className="h-9 w-full rounded border border-slate-200 px-2 text-sm"
            >
              <option value="">All providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="default" size="sm">
              Apply
            </Button>
            <NextLink
              href="/billing"
              className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              Reset
            </NextLink>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
