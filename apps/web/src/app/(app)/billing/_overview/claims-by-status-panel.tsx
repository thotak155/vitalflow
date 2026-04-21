import { Card, CardContent } from "@vitalflow/ui";

import type { ClaimsByStatus, Result } from "../../../../lib/billing-overview-context.js";

import { MiniBar, PanelEmpty, PanelError, PanelHeader } from "./kpi.js";

// Tone per claim status (mirrors the status badge palette).
const TONE_BY_STATUS: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  draft: "default",
  ready: "info",
  submitted: "warning",
  accepted: "info",
  paid: "success",
  partial: "warning",
  denied: "destructive",
  rejected: "destructive",
  appealed: "warning",
  closed: "default",
};

export function ClaimsByStatusPanel({
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
  return (
    <Card>
      <PanelHeader title="Claims by status" subtitle={`${from} – ${to}`} />
      <CardContent className="pt-0">
        {!data.ok ? (
          <PanelError reason={data.reason} />
        ) : data.value.byStatus.length === 0 ? (
          <PanelEmpty text="No claims in this range." />
        ) : (
          <ClaimsBars data={data.value} from={from} to={to} providerId={providerId} />
        )}
      </CardContent>
    </Card>
  );
}

function ClaimsBars({
  data,
  from,
  to,
  providerId,
}: {
  data: ClaimsByStatus;
  from: string;
  to: string;
  providerId?: string;
}) {
  const max = Math.max(1, ...data.byStatus.map((b) => b.count));
  return (
    <div>
      {data.byStatus.map(({ status, count }) => {
        const qp = new URLSearchParams({ status, from, to });
        if (providerId) qp.set("provider", providerId);
        return (
          <MiniBar
            key={status}
            label={<span className="uppercase tracking-wide">{status}</span>}
            value={count}
            max={max}
            tone={TONE_BY_STATUS[status] ?? "default"}
            rightLabel={count.toLocaleString()}
            href={`/billing/claims?${qp.toString()}`}
          />
        );
      })}
    </div>
  );
}
