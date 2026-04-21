import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@vitalflow/ui";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getSession } from "../../../../../lib/session.js";
import { getClaimDetail } from "../../../../../lib/billing-context.js";
import {
  ClaimStatusBadge,
  DenialStatusBadge,
  FlashBanner,
  MoneyCell,
  PriorityDot,
  RelativeTime,
  firstOrUndef,
} from "../../shared.js";
import {
  appealClaim,
  applyRemittance,
  closeClaim,
  markClaimReady,
  submitClaim,
} from "../actions.js";

export const dynamic = "force-dynamic";

export default async function ClaimDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = (await getSession())!;
  const { id } = await params;
  const sp = await searchParams;

  const detail = await getClaimDetail(session, id);
  if (!detail) notFound();

  const { claim, lines, history, denials } = detail;
  const canWrite = session.permissions.includes("billing:write");
  const currency = claim.currency;

  return (
    <div className="space-y-4">
      <FlashBanner ok={firstOrUndef(sp.ok)} error={firstOrUndef(sp.error)} />

      {/* Header --------------------------------------------------- */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <span className="font-mono">{claim.number}</span>
              <ClaimStatusBadge status={claim.status} />
            </CardTitle>
            <p className="text-sm text-slate-600">
              Service{" "}
              {claim.serviceStartDate === claim.serviceEndDate
                ? claim.serviceStartDate
                : `${claim.serviceStartDate} – ${claim.serviceEndDate}`}
              {" · "}Last activity <RelativeTime iso={claim.updatedAt} />
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-right text-sm">
            <Metric label="Total">
              <MoneyCell minor={claim.totalMinor} currency={currency} bold />
            </Metric>
            <Metric label="Paid">
              <MoneyCell minor={claim.paidMinor} currency={currency} />
            </Metric>
            <Metric label="Pat Resp">
              <MoneyCell minor={claim.patientRespMinor} currency={currency} />
            </Metric>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Patient + payer + provider ---------------------------- */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Claim context</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            <InfoBlock label="Patient">
              <NextLink href={`/patients/${claim.patientId}`} className="text-sky-700 underline">
                {claim.patientName}
              </NextLink>
            </InfoBlock>
            <InfoBlock label="Payer">{claim.payerName}</InfoBlock>
            <InfoBlock label="External claim ID">
              {claim.externalClaimId ? (
                <span className="font-mono text-xs">{claim.externalClaimId}</span>
              ) : (
                <span className="italic text-slate-500">—</span>
              )}
            </InfoBlock>
            <InfoBlock label="Created">
              <RelativeTime iso={claim.createdAt} />
            </InfoBlock>
            <InfoBlock label="Submitted">
              <RelativeTime iso={claim.submittedAt} />
            </InfoBlock>
            <InfoBlock label="Adjudicated">
              <RelativeTime iso={claim.adjudicatedAt} />
            </InfoBlock>
          </CardContent>
        </Card>

        {/* Actions ---------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!canWrite ? (
              <p className="text-xs italic text-slate-500">Requires billing:write.</p>
            ) : null}

            {canWrite && claim.status === "draft" ? (
              <form action={markClaimReady}>
                <input type="hidden" name="claim_id" value={claim.id} />
                <Button type="submit" variant="default" size="sm" className="w-full">
                  Mark ready
                </Button>
              </form>
            ) : null}

            {canWrite && claim.status === "ready" ? (
              <form action={submitClaim}>
                <input type="hidden" name="claim_id" value={claim.id} />
                <Button type="submit" variant="default" size="sm" className="w-full">
                  Submit
                </Button>
                <p className="mt-1 text-[11px] italic text-slate-500">
                  Clearinghouse wiring ships in a follow-up.
                </p>
              </form>
            ) : null}

            {canWrite && ["submitted", "accepted", "partial", "denied"].includes(claim.status) ? (
              <form action={applyRemittance}>
                <input type="hidden" name="claim_id" value={claim.id} />
                <Button type="submit" variant="secondary" size="sm" className="w-full">
                  Apply remittance
                </Button>
                <p className="mt-1 text-[11px] italic text-slate-500">
                  835 parser ships with the clearinghouse adapter.
                </p>
              </form>
            ) : null}

            {canWrite && ["denied", "partial", "rejected"].includes(claim.status) ? (
              <details className="rounded border border-slate-200 p-2">
                <summary className="cursor-pointer text-sm">Appeal…</summary>
                <form action={appealClaim} className="mt-2 space-y-2">
                  <input type="hidden" name="claim_id" value={claim.id} />
                  <FormField label="Reason" htmlFor="claim-appeal-reason">
                    <Textarea
                      id="claim-appeal-reason"
                      name="reason"
                      rows={3}
                      minLength={5}
                      maxLength={2000}
                      required
                    />
                  </FormField>
                  <Button type="submit" variant="default" size="sm">
                    Submit appeal
                  </Button>
                </form>
              </details>
            ) : null}

            {canWrite && claim.status !== "closed" ? (
              <details className="rounded border border-slate-200 p-2">
                <summary className="cursor-pointer text-sm">Close claim…</summary>
                <form action={closeClaim} className="mt-2 space-y-2">
                  <input type="hidden" name="claim_id" value={claim.id} />
                  <FormField label="Reason" htmlFor="claim-close-reason">
                    <Textarea
                      id="claim-close-reason"
                      name="reason"
                      rows={2}
                      minLength={5}
                      maxLength={500}
                      required
                    />
                  </FormField>
                  <Button type="submit" variant="destructive" size="sm">
                    Close
                  </Button>
                </form>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Claim lines --------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claim lines ({lines.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>CPT</TableHead>
                <TableHead>Mods</TableHead>
                <TableHead>ICD-10</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Charge</TableHead>
                <TableHead className="text-right">Allowed</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Adj</TableHead>
                <TableHead>Denial codes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.lineNumber}</TableCell>
                  <TableCell className="font-mono text-xs">{l.cptCode ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.modifiers.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.icd10Codes.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right">{l.units}</TableCell>
                  <TableCell className="text-right">
                    <MoneyCell minor={l.chargeMinor} currency={l.currency} />
                  </TableCell>
                  <TableCell className="text-right">
                    {l.allowedMinor !== null ? (
                      <MoneyCell minor={l.allowedMinor} currency={l.currency} />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyCell minor={l.paidMinor} currency={l.currency} />
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyCell minor={l.adjustmentMinor} currency={l.currency} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.denialCodes.length > 0 ? l.denialCodes.join(", ") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Linked denials ------------------------------------------ */}
      {denials.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linked denials ({denials.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Codes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {denials.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <PriorityDot priority={d.priority} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.denialCodes.join(", ")}</TableCell>
                    <TableCell className="text-right">
                      <MoneyCell minor={d.deniedAmountMinor} currency={d.currency} />
                    </TableCell>
                    <TableCell>
                      <DenialStatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <RelativeTime iso={d.createdAt} />
                    </TableCell>
                    <TableCell className="text-right">
                      <NextLink
                        href={`/billing/denials/${d.id}`}
                        className="text-xs text-sky-700 underline"
                      >
                        Work →
                      </NextLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {/* Status history ------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status history</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm italic text-slate-500">No transitions recorded.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-3">
                  <span
                    className="mt-1 inline-block h-2 w-2 rounded-full bg-slate-400"
                    aria-hidden
                  />
                  <div className="flex-1">
                    <span className="font-mono text-xs text-slate-500">
                      {new Date(h.occurredAt).toLocaleString()}
                    </span>
                    <div>
                      {h.fromStatus ? (
                        <>
                          <ClaimStatusBadge status={h.fromStatus} /> →{" "}
                        </>
                      ) : null}
                      <ClaimStatusBadge status={h.toStatus} />
                    </div>
                    {h.message ? (
                      <p className="mt-0.5 text-xs italic text-slate-600">{h.message}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function InfoBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p>{children}</p>
    </div>
  );
}
