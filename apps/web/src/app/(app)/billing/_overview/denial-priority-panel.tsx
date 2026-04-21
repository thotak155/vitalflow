import { Card, CardContent } from "@vitalflow/ui";

import type { DenialPriorityBreakdown, Result } from "../../../../lib/billing-overview-context.js";

import { MiniBar, PanelEmpty, PanelError, PanelHeader } from "./kpi.js";

const TONE_BY_PRIORITY: Record<number, "destructive" | "warning" | "default"> = {
  1: "destructive",
  2: "destructive",
  3: "warning",
  4: "default",
  5: "default",
};

export function DenialPriorityPanel({ data }: { data: Result<DenialPriorityBreakdown> }) {
  return (
    <Card>
      <PanelHeader title="Open denials by priority" subtitle="point-in-time" />
      <CardContent className="pt-0">
        {!data.ok ? (
          <PanelError reason={data.reason} />
        ) : data.value.totalOpen === 0 ? (
          <PanelEmpty text="No open denials." />
        ) : (
          <PriorityBars data={data.value} />
        )}
      </CardContent>
    </Card>
  );
}

function PriorityBars({ data }: { data: DenialPriorityBreakdown }) {
  const max = Math.max(1, ...data.byPriority.map((b) => b.count));
  return (
    <div>
      {data.byPriority.map(({ priority, count }) => (
        <MiniBar
          key={priority}
          label={
            <span>
              ★{priority}
              {priority <= 2 ? <span className="ml-1 text-red-600">urgent</span> : null}
            </span>
          }
          value={count}
          max={max}
          tone={TONE_BY_PRIORITY[priority] ?? "default"}
          rightLabel={count.toLocaleString()}
          href={`/billing/denials?priority=${priority}`}
        />
      ))}
    </div>
  );
}
