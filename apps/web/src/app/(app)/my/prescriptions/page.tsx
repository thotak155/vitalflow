import { ComingSoon } from "../../../../components/coming-soon.js";

export default function MyPrescriptionsPage() {
  return (
    <ComingSoon
      title="My prescriptions"
      breadcrumb="Prescriptions"
      milestone="Patient portal V2"
      lede="Your medications — current prescriptions, refill history, and one-click refill requests."
      bullets={[
        "Current active prescriptions with strength + directions",
        "Refill history with pharmacy location",
        "One-click refill request routed to prescriber",
        "Medication adherence reminders (opt-in)",
        "Drug-drug interaction warnings",
      ]}
    />
  );
}
