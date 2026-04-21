import NextLink from "next/link";

import type { ClaimsByStatus, Result } from "../../../../lib/billing-overview-context.js";

import { KpiCard } from "./kpi.js";

export function ClaimsInRangeCard({
  data,
  from,
  to,
  providerId,
}: {
  data: Result<ClaimsByStatus>;
  from: string;
  to: string;
  providerId?: string;
}) {
  if (!data.ok) {
    return (
      <KpiCard
        label="Claims in range"
        primary="—"
        subtext={`Unavailable: ${data.reason.slice(0, 120)}`}
      />
    );
  }

  const { totalCount, byStatus } = data.value;
  const openCount = byStatus
    .filter((b) => !["paid", "closed", "rejected"].includes(b.status))
    .reduce((s, b) => s + b.count, 0);

  const qp = new URLSearchParams({ from, to });
  if (providerId) qp.set("provider", providerId);
  const href = `/billing/claims?${qp.toString()}`;

  return (
    <KpiCard
      label="Claims in range"
      primary={totalCount.toLocaleString()}
      secondary={
        <>
          {openCount.toLocaleString()} in-flight ·{" "}
          <NextLink href={href} className="text-sky-700 underline">
            view list →
          </NextLink>
        </>
      }
      subtext={`${from} – ${to}`}
    />
  );
}
