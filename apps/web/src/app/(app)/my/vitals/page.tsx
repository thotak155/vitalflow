import { ComingSoon } from "../../../../components/coming-soon.js";

export default function MyVitalsPage() {
  return (
    <ComingSoon
      title="My vitals"
      breadcrumb="Vitals"
      milestone="Patient portal V2"
      lede="Your vitals trend over time — blood pressure, weight, glucose, and any connected-device readings."
      bullets={[
        "Home-measured vitals (BP, weight, glucose, SpO2)",
        "In-office vitals synced from each encounter",
        "Connected-device integration (Apple Health, Fitbit, Withings)",
        "Trend charts with clinician-set targets",
        "Out-of-range alerts routed to your care team",
      ]}
    />
  );
}
