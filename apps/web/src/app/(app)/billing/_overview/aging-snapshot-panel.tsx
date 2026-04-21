import { Card, CardContent } from "@vitalflow/ui";

import type { AgingSnapshot, Result } from "../../../../lib/billing-overview-context.js";

import { MiniBar, PanelEmpty, PanelError, PanelHeader } from "./kpi.js";
import { formatMoney } from "../shared.js";

export function AgingSnapshotPanel({ data }: { data: Result<AgingSnapshot> }) {
  return (
    <Card>
      <PanelHeader
        title="Aging snapshot"
        subtitle="current state (point-in-time)"
        action={
          <span className="italic text-slate-400">nightly snapshots arrive in a follow-up</span>
        }
      />
      <CardContent className="pt-0">
        {!data.ok ? (
          <PanelError reason={data.reason} />
        ) : data.value.b0_30Minor +
            data.value.b31_60Minor +
            data.value.b61_90Minor +
            data.value.bOver90Minor ===
          0 ? (
          <PanelEmpty text="No outstanding patient balances." />
        ) : (
          <AgingBars data={data.value} />
        )}
      </CardContent>
    </Card>
  );
}

function AgingBars({ data }: { data: AgingSnapshot }) {
  const max = Math.max(1, data.b0_30Minor, data.b31_60Minor, data.b61_90Minor, data.bOver90Minor);
  const rows: ReadonlyArray<{
    label: string;
    minor: number;
    tone: "default" | "warning" | "destructive" | "info";
    band: string;
  }> = [
    { label: "0–30", minor: data.b0_30Minor, tone: "info", band: "0-30" },
    { label: "31–60", minor: data.b31_60Minor, tone: "default", band: "31-60" },
    { label: "61–90", minor: data.b61_90Minor, tone: "warning", band: "61-90" },
    { label: "90+", minor: data.bOver90Minor, tone: "destructive", band: "over-90" },
  ];

  return (
    <div>
      {rows.map((r) => (
        <MiniBar
          key={r.band}
          label={r.label}
          value={r.minor}
          max={max}
          tone={r.tone}
          rightLabel={formatMoney(r.minor, data.currency)}
          href={`/billing/balances?band=${r.band}`}
        />
      ))}
    </div>
  );
}
