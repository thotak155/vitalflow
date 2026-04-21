import { ComingSoon } from "../../../components/coming-soon.js";

export default function OrdersPage() {
  return (
    <ComingSoon
      title="Orders"
      milestone="Ships in clinical domain V2"
      lede="Labs, imaging, referrals, DME — all patient orders in one queue with status tracking and result reconciliation."
      bullets={[
        "Lab panels (CBC, CMP, lipids, etc.) with preferred-provider lookup",
        "Imaging requests with diagnosis justification",
        "Referrals with insurance-aware specialist search",
        "Result in-basket with abnormal-flag highlighting",
        "Order sets + templates per specialty",
      ]}
      relatedLinks={[{ label: "Encounters — order during a visit", href: "/encounters" }]}
    />
  );
}
