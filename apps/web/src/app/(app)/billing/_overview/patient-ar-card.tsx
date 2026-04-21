import type { PatientArKpi, Result } from "../../../../lib/billing-overview-context.js";

import { KpiCard, MoneyValue } from "./kpi.js";

export function PatientArCard({ data }: { data: Result<PatientArKpi> }) {
  if (!data.ok) {
    return (
      <KpiCard
        label="Patient A/R"
        primary="—"
        subtext={`Unavailable: ${data.reason.slice(0, 120)}`}
      />
    );
  }
  const { totalMinor, patientCount, currency } = data.value;
  return (
    <KpiCard
      label="Patient A/R"
      primary={<MoneyValue minor={totalMinor} currency={currency} />}
      secondary={`${patientCount.toLocaleString()} patient${patientCount === 1 ? "" : "s"} with balance`}
      subtext="cumulative — ignores range"
      href="/billing/balances"
    />
  );
}
