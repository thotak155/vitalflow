import type { Result, ChargesPostedKpi } from "../../../../lib/billing-overview-context.js";

import { KpiCard, MoneyValue } from "./kpi.js";

export function ChargesPostedCard({
  data,
  from,
  to,
}: {
  data: Result<ChargesPostedKpi>;
  from: string;
  to: string;
}) {
  if (!data.ok) {
    return (
      <KpiCard
        label="Charges posted"
        primary="—"
        subtext={`Unavailable: ${data.reason.slice(0, 120)}`}
      />
    );
  }
  const sameDay = from === to;
  return (
    <KpiCard
      label={sameDay ? "Charges posted today" : "Charges posted"}
      primary={data.value.count.toLocaleString()}
      secondary={<MoneyValue minor={data.value.totalMinor} currency={data.value.currency} />}
      subtext={sameDay ? from : `${from} – ${to}`}
    />
  );
}
