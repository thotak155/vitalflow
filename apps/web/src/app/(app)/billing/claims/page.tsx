import type { ClaimStatus } from "@vitalflow/types";
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
import {
  getClaimList,
  listActivePayers,
  type ClaimListFilter,
} from "../../../../lib/billing-context.js";
import {
  ClaimStatusBadge,
  FlashBanner,
  MoneyCell,
  Pagination,
  RelativeTime,
  firstOrEmpty,
  firstOrUndef,
  toArray,
} from "../shared.js";

export const dynamic = "force-dynamic";

const CLAIM_STATUSES: readonly ClaimStatus[] = [
  "draft",
  "ready",
  "submitted",
  "accepted",
  "rejected",
  "paid",
  "partial",
  "denied",
  "appealed",
  "closed",
];

export default async function ClaimsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = (await getSession())!; // gated by layout
  const sp = await searchParams;

  const selectedStatuses = toArray(sp.status) as readonly ClaimStatus[];
  const filter: ClaimListFilter = {
    status: selectedStatuses.length > 0 ? selectedStatuses : undefined,
    payerId: firstOrUndef(sp.payer),
    providerId: firstOrUndef(sp.provider),
    serviceFrom: firstOrUndef(sp.from),
    serviceTo: firstOrUndef(sp.to),
    q: firstOrUndef(sp.q),
    page: Number(firstOrEmpty(sp.page) || "1"),
  };

  const [list, payers] = await Promise.all([
    getClaimList(session, filter),
    listActivePayers(session),
  ]);

  const anyFilter =
    (filter.status?.length ?? 0) > 0 ||
    !!filter.payerId ||
    !!filter.providerId ||
    !!filter.serviceFrom ||
    !!filter.serviceTo ||
    !!filter.q;

  return (
    <div className="space-y-4">
      <FlashBanner ok={firstOrUndef(sp.ok)} error={firstOrUndef(sp.error)} />

      <Card>
        <CardContent className="pt-4">
          <form method="GET" className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <FormField label="Status" htmlFor="f-status" className="md:col-span-2">
              <select
                id="f-status"
                name="status"
                multiple
                defaultValue={selectedStatuses as string[]}
                className="h-24 w-full rounded border border-slate-200 px-2 py-1 text-sm"
              >
                {CLAIM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Payer" htmlFor="f-payer">
              <select
                id="f-payer"
                name="payer"
                defaultValue={filter.payerId ?? ""}
                className="h-9 w-full rounded border border-slate-200 px-2 text-sm"
              >
                <option value="">Any</option>
                {payers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Service from" htmlFor="f-from">
              <Input type="date" id="f-from" name="from" defaultValue={filter.serviceFrom ?? ""} />
            </FormField>

            <FormField label="Service to" htmlFor="f-to">
              <Input type="date" id="f-to" name="to" defaultValue={filter.serviceTo ?? ""} />
            </FormField>

            <FormField label="Search" htmlFor="f-q" className="md:col-span-4">
              <Input
                id="f-q"
                name="q"
                defaultValue={filter.q ?? ""}
                placeholder="Claim # (e.g. CLM-2026-000001)"
              />
            </FormField>

            <div className="flex items-end gap-2">
              <Button type="submit" variant="default" size="sm">
                Apply
              </Button>
              <NextLink
                href="/billing/claims"
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
            <ClaimEmptyState anyFilter={anyFilter} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Service dates</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Pat Resp</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      <NextLink href={`/billing/claims/${c.id}`} className="text-sky-700 underline">
                        {c.number}
                      </NextLink>
                    </TableCell>
                    <TableCell>{c.patientName}</TableCell>
                    <TableCell>{c.payerName}</TableCell>
                    <TableCell>
                      <ClaimStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.serviceStartDate === c.serviceEndDate
                        ? c.serviceStartDate
                        : `${c.serviceStartDate} – ${c.serviceEndDate}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell minor={c.totalMinor} currency={c.currency} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell minor={c.paidMinor} currency={c.currency} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell minor={c.patientRespMinor} currency={c.currency} />
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <RelativeTime iso={c.updatedAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Pagination
            basePath="/billing/claims"
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

function ClaimEmptyState({ anyFilter }: { anyFilter: boolean }) {
  return (
    <div className="p-8 text-center text-sm text-slate-600">
      {anyFilter ? (
        <>
          <p className="font-medium text-slate-800">No claims match these filters.</p>
          <p className="mt-1">
            <NextLink href="/billing/claims" className="text-sky-700 underline">
              Clear filters
            </NextLink>
          </p>
        </>
      ) : (
        <>
          <p className="font-medium text-slate-800">No claims yet.</p>
          <p className="mt-1">
            Create claims from posted charges on an encounter. Charge capture is in the encounter
            workspace.
          </p>
        </>
      )}
    </div>
  );
}
