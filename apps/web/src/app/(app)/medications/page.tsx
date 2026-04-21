import { ComingSoon } from "../../../components/coming-soon.js";

export default function MedicationsPage() {
  return (
    <ComingSoon
      title="Medications"
      milestone="Ships in clinical domain V2"
      lede="Active patient medications across the practice — refills, interactions, adherence flags, and RxNorm-linked ordering."
      bullets={[
        "Cross-patient medication view for the logged-in prescriber",
        "Drug–drug interaction checks (leveraging RxNorm)",
        "Refill queue with one-click e-prescribing",
        "Adherence signals from pharmacy claims data",
        "Controlled-substance audit trail",
      ]}
      relatedLinks={[{ label: "Patients — per-patient med list", href: "/patients" }]}
    />
  );
}
