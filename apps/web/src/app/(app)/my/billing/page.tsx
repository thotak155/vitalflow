import { ComingSoon } from "../../../../components/coming-soon.js";

export default function MyBillingPage() {
  return (
    <ComingSoon
      title="My bills"
      breadcrumb="Billing"
      milestone="Patient portal V2"
      lede="See balance, pay online, set up a payment plan, or download a statement. All pulled from the same claim/payment ledger your care team uses."
      bullets={[
        "Current balance across all visits",
        "One-click pay with saved card (Stripe)",
        "Payment-plan enrollment with autopay",
        "Statement history download (PDF)",
        "Insurance claim-status visibility per visit",
        "Explanation-of-benefits viewer",
      ]}
    />
  );
}
