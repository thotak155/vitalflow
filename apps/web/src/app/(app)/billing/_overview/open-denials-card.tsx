import type { OpenDenialsKpi, Result } from "../../../../lib/billing-overview-context.js";

import { KpiCard, MoneyValue } from "./kpi.js";

export function OpenDenialsCard({ data }: { data: Result<OpenDenialsKpi> }) {
  if (!data.ok) {
    return (
      <KpiCard
        label="Open denials"
        primary="—"
        subtext={`Unavailable: ${data.reason.slice(0, 120)}`}
      />
    );
  }
  const { count, totalMinor, currency, urgentCount, agedCount } = data.value;
  const tone = urgentCount > 0 ? "destructive" : count > 0 ? "warning" : "default";

  return (
    <KpiCard
      label="Open denials"
      primary={count.toLocaleString()}
      secondary={<MoneyValue minor={totalMinor} currency={currency} />}
      subtext={
        count === 0 ? "nothing in the queue" : `${urgentCount} urgent · ${agedCount} aged >30d`
      }
      tone={tone}
      href="/billing/denials"
    />
  );
}
