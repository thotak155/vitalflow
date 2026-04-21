import { ComingSoon } from "../../../../components/coming-soon.js";

export default function AdminBillingPage() {
  return (
    <ComingSoon
      title="Admin · Billing configuration"
      breadcrumb="Billing configuration"
      milestone="Tenant admin V2"
      lede="Tenant-level billing setup — not to be confused with the revenue-cycle workspace (that's under the Billing section in the left nav)."
      bullets={[
        "Subscription plan + seat count",
        "Payment method on file (Stripe)",
        "Monthly usage (AI requests, storage, API calls)",
        "Invoice history from VitalFlow to this tenant",
        "Billing-config switches (statement template, dunning schedule)",
      ]}
      relatedLinks={[
        { label: "Revenue cycle dashboard", href: "/billing" },
        { label: "Payer admin", href: "/admin/payers" },
      ]}
    />
  );
}
