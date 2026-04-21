import { ComingSoon } from "../../../../components/coming-soon.js";

export default function AdminSettingsPage() {
  return (
    <ComingSoon
      title="Admin · Settings"
      breadcrumb="Settings"
      milestone="Tenant admin V2"
      lede="Tenant-wide settings — practice details, display locale, default templates, integration wiring."
      bullets={[
        "Practice profile: name, NPI, taxonomy, address, logo",
        "Default templates for SOAP, intake, visit summaries",
        "Locale + timezone + currency",
        "Integration connections (clearinghouse, e-Rx, lab)",
        "Feature flags controlled by the tenant admin",
      ]}
      relatedLinks={[
        { label: "Members", href: "/admin/members" },
        { label: "Payer admin", href: "/admin/payers" },
      ]}
    />
  );
}
