import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Textarea,
} from "@vitalflow/ui";
import NextLink from "next/link";
import { notFound } from "next/navigation";

import { getSession } from "../../../../../lib/session.js";
import { getDenialDetail } from "../../../../../lib/billing-context.js";
import {
  ClaimStatusBadge,
  DenialStatusBadge,
  FlashBanner,
  MoneyCell,
  PriorityDot,
  daysAgo,
  firstOrUndef,
} from "../../shared.js";
import {
  appealDenial,
  assignDenialToMe,
  recordDenialWork,
  resolveDenial,
  writeOffDenial,
} from "../actions.js";

export const dynamic = "force-dynamic";

const TERMINAL: readonly string[] = ["resolved", "written_off", "uncollectable"];

export default async function DenialDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = (await getSession())!;
  const { id } = await params;
  const sp = await searchParams;

  const detail = await getDenialDetail(session, id);
  if (!detail) notFound();

  const { denial, claimId, claimNumber, claimStatus, lineCpt } = detail;
  const canWrite = session.permissions.includes("billing:write");
  const canWriteOff = session.permissions.includes("billing:write_off");
  const isTerminal = TERMINAL.includes(denial.status);
  const age = daysAgo(denial.createdAt);

  return (
    <div className="space-y-4">
      <FlashBanner ok={firstOrUndef(sp.ok)} error={firstOrUndef(sp.error)} />

      {/* Header --------------------------------------------------- */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              Denial <PriorityDot priority={denial.priority} />
              <DenialStatusBadge status={denial.status} />
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>Codes:</span>
              {denial.denialCodes.map((c) => (
                <code
                  key={c}
                  className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800"
                >
                  {c}
                </code>
              ))}
              <span>·</span>
              <span>
                Denied <MoneyCell minor={denial.deniedAmountMinor} currency={denial.currency} />
              </span>
              <span>·</span>
              <span className={age > 30 ? "font-semibold text-red-700" : ""}>Age {age}d</span>
              <span>·</span>
              <span>
                Recovered{" "}
                <MoneyCell minor={denial.recoveredAmountMinor} currency={denial.currency} />
              </span>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Claim context + reason ------------------------------- */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Claim context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Claim</p>
              <p>
                <NextLink
                  href={`/billing/claims/${claimId}`}
                  className="font-mono text-sky-700 underline"
                >
                  {claimNumber}
                </NextLink>{" "}
                <ClaimStatusBadge status={claimStatus} />
              </p>
            </div>
            {lineCpt ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Line CPT</p>
                <p className="font-mono text-xs">{lineCpt}</p>
              </div>
            ) : null}
            {denial.reasonText ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Payer reason</p>
                <p className="whitespace-pre-wrap">{denial.reasonText}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Assignment ------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Assigned to</p>
              <p>
                {denial.assignedTo ? (
                  <span className="font-mono text-xs">{denial.assignedTo.slice(0, 8)}</span>
                ) : (
                  <span className="italic text-slate-500">unassigned</span>
                )}
              </p>
            </div>
            {canWrite && !isTerminal ? (
              <>
                <form action={assignDenialToMe}>
                  <input type="hidden" name="denial_id" value={denial.id} />
                  <Button type="submit" variant="secondary" size="sm" className="w-full">
                    Assign to me
                  </Button>
                </form>
                <AssignToOtherForm denialId={denial.id} />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Work log ------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Work log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {canWrite && !isTerminal ? (
            <form action={recordDenialWork} className="space-y-2">
              <input type="hidden" name="denial_id" value={denial.id} />
              <FormField label="Add work note" htmlFor="denial-work-note">
                <Textarea
                  id="denial-work-note"
                  name="note"
                  rows={3}
                  minLength={1}
                  maxLength={2000}
                  placeholder="Called payer, referenced claim line 2, requested reprocess..."
                  required
                />
              </FormField>
              <Button type="submit" variant="default" size="sm">
                Record work
              </Button>
            </form>
          ) : null}

          {denial.workNote ? (
            <pre className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-slate-800">
              {denial.workNote}
            </pre>
          ) : (
            <p className="text-sm italic text-slate-500">No work notes recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Resolution actions -------------------------------------- */}
      {!isTerminal ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolve denial</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {canWrite ? (
              <details className="rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Resolve…</summary>
                <form action={resolveDenial} className="mt-2 space-y-2">
                  <input type="hidden" name="denial_id" value={denial.id} />
                  <FormField label="Resolution" htmlFor="den-resolution">
                    <Textarea
                      id="den-resolution"
                      name="resolution"
                      rows={3}
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </FormField>
                  <FormField label="Recovered amount (USD)" htmlFor="den-recovered">
                    <Input
                      id="den-recovered"
                      name="recovered_amount"
                      type="number"
                      step="0.01"
                      min={0}
                      defaultValue="0"
                    />
                  </FormField>
                  <Button type="submit" variant="default" size="sm">
                    Mark resolved
                  </Button>
                </form>
              </details>
            ) : null}

            {canWrite ? (
              <details className="rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Appeal…</summary>
                <form action={appealDenial} className="mt-2 space-y-2">
                  <input type="hidden" name="denial_id" value={denial.id} />
                  <FormField label="Appeal note" htmlFor="den-appeal-note">
                    <Textarea
                      id="den-appeal-note"
                      name="note"
                      rows={3}
                      minLength={5}
                      maxLength={2000}
                      required
                    />
                  </FormField>
                  <Button type="submit" variant="secondary" size="sm">
                    Submit appeal
                  </Button>
                </form>
              </details>
            ) : null}

            <details
              className={`rounded border p-3 ${canWriteOff ? "border-slate-200" : "border-slate-100 bg-slate-50"}`}
            >
              <summary
                className={`cursor-pointer text-sm font-semibold ${canWriteOff ? "" : "text-slate-400"}`}
              >
                Write off…
              </summary>
              {canWriteOff ? (
                <form action={writeOffDenial} className="mt-2 space-y-2">
                  <input type="hidden" name="denial_id" value={denial.id} />
                  <FormField label="Write-off reason" htmlFor="den-writeoff">
                    <Textarea
                      id="den-writeoff"
                      name="reason"
                      rows={3}
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </FormField>
                  <Button type="submit" variant="destructive" size="sm">
                    Write off
                  </Button>
                </form>
              ) : (
                <p className="mt-2 text-xs italic text-slate-500">
                  Requires billing:write_off. Impersonated users cannot write off.
                </p>
              )}
            </details>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 text-sm text-slate-700">
            This denial is in terminal state <DenialStatusBadge status={denial.status} /> and cannot
            be reopened.{" "}
            {denial.resolution ? <span className="italic">— {denial.resolution}</span> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AssignToOtherForm({ denialId }: { denialId: string }) {
  return (
    <details className="rounded border border-slate-200 p-2">
      <summary className="cursor-pointer text-xs text-slate-600">Assign to someone else…</summary>
      <form action="/billing/denials/assign-redirect" className="mt-2 space-y-2">
        {/* Placeholder — the real assignDenial takes an assignee UUID.
            V1 UI is "assign to me"; selecting from the full member list
            requires a dropdown of tenant members, which lands with the
            members endpoint in a follow-up slice. */}
        <p className="text-[11px] italic text-slate-500">
          Member picker ships in a follow-up slice. For now, paste a user UUID to force-assign.
        </p>
        <Input name="assignee" placeholder="user uuid" className="font-mono text-xs" />
        <input type="hidden" name="denial_id" value={denialId} />
        <Button type="submit" variant="secondary" size="sm" disabled>
          Assign
        </Button>
      </form>
    </details>
  );
}
