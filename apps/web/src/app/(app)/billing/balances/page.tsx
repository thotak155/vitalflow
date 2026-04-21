import type { AgingBand } from "@vitalflow/types";
import {
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vitalflow/ui";
import NextLink from "next/link";

import { getSession } from "../../../../lib/session.js";
import { getBalanceList, type BalanceListFilter } from "../../../../lib/billing-context.js";
import {
  FlashBanner,
  MoneyCell,
  Pagination,
  RelativeTime,
  firstOrEmpty,
  firstOrUndef,
} from "../shared.js";

export const dynamic = "force-dynamic";

export default async function BalancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = (await getSession())!;
  const sp = await searchParams;

  const band = normalizeBand(firstOrUndef(sp.band));
  const minDollars = firstOrUndef(sp.min);
  const filter: BalanceListFilter = {
    band,
    minBalanceMinor: minDollars ? dollarsToMinor(minDollars) : undefined,
    q: firstOrUndef(sp.q),
    page: Number(firstOrEmpty(sp.page) || "1"),
  };

  const list = await getBalanceList(session, filter);

  return (
    <div className="space-y-4">
      <FlashBanner ok={firstOrUndef(sp.ok)} error={firstOrUndef(sp.error)} />

      <Card>
        <CardContent className="pt-4">
          <form method="GET" className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <FormField label="Aging band" htmlFor="f-band">
              <select
                id="f-band"
                name="band"
                defaultValue={filter.band ?? "all"}
                className="h-9 w-full rounded border border-slate-200 px-2 text-sm"
              >
                <option value="all">All</option>
                <option value="0-30">0–30</option>
                <option value="31-60">31–60</option>
                <option value="61-90">61–90</option>
                <option value="over-90">90+</option>
              </select>
            </FormField>

            <FormField label="Min balance (USD)" htmlFor="f-min">
              <Input
                id="f-min"
                name="min"
                type="number"
                step="0.01"
                defaultValue={minDollars ?? ""}
              />
            </FormField>

            <FormField label="Patient search" htmlFor="f-q" className="md:col-span-2">
              <Input id="f-q" name="q" defaultValue={filter.q ?? ""} placeholder="Name…" />
            </FormField>

            <div className="flex items-end gap-2 md:col-span-4">
              <Button type="submit" variant="default" size="sm">
                Apply
              </Button>
              <NextLink
                href="/billing/balances"
                className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                Clear
              </NextLink>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {list.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-600">
              <p className="font-medium text-slate-800">No patients with outstanding balances.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">0–30</TableHead>
                  <TableHead className="text-right">31–60</TableHead>
                  <TableHead className="text-right">61–90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead>Last payment</TableHead>
                  <TableHead>Last statement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <NextLink
                        href={`/patients/${b.patientId}`}
                        className="text-sky-700 underline"
                      >
                        {b.patientName}
                      </NextLink>
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell minor={b.currentBalanceMinor} currency={b.currency} bold />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell minor={b.aging0_30Minor} currency={b.currency} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell minor={b.aging31_60Minor} currency={b.currency} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell minor={b.aging61_90Minor} currency={b.currency} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell minor={b.agingOver90Minor} currency={b.currency} danger />
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <RelativeTime iso={b.lastPaymentAt} />
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <RelativeTime iso={b.lastStatementAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Pagination
            basePath="/billing/balances"
            searchParams={sp}
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function normalizeBand(v: string | undefined): AgingBand | undefined {
  if (v === "0-30" || v === "31-60" || v === "61-90" || v === "over-90") return v;
  return undefined;
}

function dollarsToMinor(s: string): number {
  const n = Number.parseFloat(s.replace(/[$,]/g, ""));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}
