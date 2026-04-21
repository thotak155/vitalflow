import { getSession } from "../../../lib/session.js";
import {
  getAgingSnapshot,
  getChargesPosted,
  getClaimsByStatus,
  getDenialPriorityBreakdown,
  getOpenDenials,
  getPatientAr,
  getRecentPayments,
  listProvidersInClaims,
  resolveRange,
} from "../../../lib/billing-overview-context.js";

import { AgingSnapshotPanel } from "./_overview/aging-snapshot-panel.js";
import { ChargesPostedCard } from "./_overview/charges-posted-card.js";
import { ClaimsByStatusPanel } from "./_overview/claims-by-status-panel.js";
import { ClaimsInRangeCard } from "./_overview/claims-in-range-card.js";
import { DenialPriorityPanel } from "./_overview/denial-priority-panel.js";
import { OpenDenialsCard } from "./_overview/open-denials-card.js";
import { OverviewFilterBar } from "./_overview/filter-bar.js";
import { PatientArCard } from "./_overview/patient-ar-card.js";
import { RecentPaymentsPanel } from "./_overview/recent-payments-panel.js";
import { FlashBanner, firstOrUndef } from "./shared.js";

export const dynamic = "force-dynamic";

export default async function BillingOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = (await getSession())!; // gated by layout
  const sp = await searchParams;

  const rangePreset = firstOrUndef(sp.range);
  const explicitFrom = firstOrUndef(sp.from);
  const explicitTo = firstOrUndef(sp.to);
  const providerId = firstOrUndef(sp.provider);

  const { from, to } = resolveRange({
    range: rangePreset,
    from: explicitFrom,
    to: explicitTo,
  });
  const filter = { from, to, providerId };

  // Run all panel queries + provider lookup in parallel. Each returns a
  // Result<T>; failures surface per-panel, not as a page-wide error.
  const [
    providers,
    chargesRes,
    denialsRes,
    arRes,
    claimsByStatusRes,
    agingRes,
    paymentsRes,
    priorityRes,
  ] = await Promise.all([
    listProvidersInClaims(session),
    getChargesPosted(session, filter),
    getOpenDenials(session),
    getPatientAr(session),
    getClaimsByStatus(session, filter),
    getAgingSnapshot(session),
    getRecentPayments(session, filter),
    getDenialPriorityBreakdown(session),
  ]);

  return (
    <div className="space-y-4">
      <FlashBanner ok={firstOrUndef(sp.ok)} error={firstOrUndef(sp.error)} />

      <OverviewFilterBar
        from={from}
        to={to}
        providerId={providerId}
        activePreset={rangePreset}
        providers={providers}
      />

      {/* Row 1 — KPI cards --------------------------------------- */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <ChargesPostedCard data={chargesRes} from={from} to={to} />
        <OpenDenialsCard data={denialsRes} />
        <PatientArCard data={arRes} />
        <ClaimsInRangeCard data={claimsByStatusRes} from={from} to={to} providerId={providerId} />
      </section>

      {/* Row 2 — panels ------------------------------------------- */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ClaimsByStatusPanel data={claimsByStatusRes} from={from} to={to} providerId={providerId} />
        <AgingSnapshotPanel data={agingRes} />
      </section>

      {/* Row 3 — feeds ------------------------------------------- */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <RecentPaymentsPanel data={paymentsRes} from={from} to={to} />
        <DenialPriorityPanel data={priorityRes} />
      </section>
    </div>
  );
}
