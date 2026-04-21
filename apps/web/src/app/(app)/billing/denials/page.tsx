import type { DenialStatus } from "@vitalflow/types";
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
import { getDenialQueue, type DenialQueueFilter } from "../../../../lib/billing-context.js";
import {
  DenialStatusBadge,
  FlashBanner,
  MoneyCell,
  Pagination,
  PriorityDot,
  RelativeTime,
  daysAgo,
  firstOrEmpty,
  firstOrUndef,
  toArray,
} from "../shared.js";

export const dynamic = "force-dynamic";

const DENIAL_STATUSES: readonly DenialStatus[] = [
  "open",
  "working",
  "appealed",
  "resolved",
  "written_off",
  "uncollectable",
];

export default async function DenialQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = (await getSession())!;
  const sp = await searchParams;

  const selectedStatuses = toArray(sp.status) as readonly DenialStatus[];
  const filter: DenialQueueFilter = {
    status: selectedStatuses.length > 0 ? selectedStatuses : undefined,
    assignee: normalizeAssignee(firstOrUndef(sp.assignee)),
    priority: sp.priority ? Number(firstOrEmpty(sp.priority)) : undefined,
    code: firstOrUndef(sp.code),
    page: Number(firstOrEmpty(sp.page) || "1"),
  };

  const queue = await getDenialQueue(session, filter);

  const anyFilter =
    (filter.status?.length ?? 0) > 0 ||
    !!filter.priority ||
    !!filter.code ||
    (filter.assignee && filter.assignee !== "any");

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
                {DENIAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] italic text-slate-500">Defaults to open + working.</p>
            </FormField>

            <FormField label="Assignee" htmlFor="f-assignee">
              <select
                id="f-assignee"
                name="assignee"
                defaultValue={filter.assignee ?? "any"}
                className="h-9 w-full rounded border border-slate-200 px-2 text-sm"
              >
                <option value="any">Anyone</option>
                <option value="me">Me</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </FormField>

            <FormField label="Priority" htmlFor="f-priority">
              <select
                id="f-priority"
                name="priority"
                defaultValue={filter.priority ? String(filter.priority) : ""}
                className="h-9 w-full rounded border border-slate-200 px-2 text-sm"
              >
                <option value="">Any</option>
                <option value="1">★1 Urgent</option>
                <option value="2">★2</option>
                <option value="3">★3</option>
                <option value="4">★4</option>
                <option value="5">★5 Low</option>
              </select>
            </FormField>

            <FormField label="Denial code" htmlFor="f-code">
              <Input id="f-code" name="code" defaultValue={filter.code ?? ""} placeholder="CO-16" />
            </FormField>

            <div className="flex items-end gap-2 md:col-span-5">
              <Button type="submit" variant="default" size="sm">
                Apply
              </Button>
              <NextLink
                href="/billing/denials"
                className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                Reset to defaults
              </NextLink>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {queue.rows.length === 0 ? (
            <DenialEmptyState anyFilter={!!anyFilter} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Claim</TableHead>
                  <TableHead>Codes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.rows.map((d) => {
                  const age = daysAgo(d.createdAt);
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <PriorityDot priority={d.priority} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <NextLink
                          href={`/billing/denials/${d.id}`}
                          className="text-sky-700 underline"
                        >
                          {d.claimNumber}
                        </NextLink>
                      </TableCell>
                      <TableCell className="space-x-1">
                        {d.denialCodes.slice(0, 3).map((c) => (
                          <code
                            key={c}
                            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700"
                          >
                            {c}
                          </code>
                        ))}
                        {d.denialCodes.length > 3 ? (
                          <span className="text-[11px] text-slate-500">
                            +{d.denialCodes.length - 3}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyCell minor={d.deniedAmountMinor} currency={d.currency} />
                      </TableCell>
                      <TableCell className={age > 30 ? "font-semibold text-red-700" : ""}>
                        {age}d
                      </TableCell>
                      <TableCell>
                        <DenialStatusBadge status={d.status} />
                      </TableCell>
                      <TableCell>
                        {d.assignedTo ? (
                          <span className="font-mono text-[11px]">{d.assignedTo.slice(0, 8)}</span>
                        ) : (
                          <span className="italic text-slate-500">unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        <RelativeTime iso={d.createdAt} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <Pagination
            basePath="/billing/denials"
            searchParams={sp}
            page={queue.page}
            pageSize={queue.pageSize}
            total={queue.total}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function DenialEmptyState({ anyFilter }: { anyFilter: boolean }) {
  return (
    <div className="p-8 text-center text-sm text-slate-600">
      {anyFilter ? (
        <>
          <p className="font-medium text-slate-800">No denials match these filters.</p>
          <p className="mt-1">
            <NextLink href="/billing/denials" className="text-sky-700 underline">
              Reset to defaults
            </NextLink>
          </p>
        </>
      ) : (
        <>
          <p className="font-medium text-slate-800">No open denials.</p>
          <p className="mt-1">Nicely done.</p>
        </>
      )}
    </div>
  );
}

function normalizeAssignee(v: string | undefined): "me" | "unassigned" | "any" | undefined {
  if (v === "me" || v === "unassigned" || v === "any") return v;
  return undefined;
}
