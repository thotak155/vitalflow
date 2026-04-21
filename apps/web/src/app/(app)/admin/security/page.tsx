import { ComingSoon } from "../../../../components/coming-soon.js";

export default function AdminSecurityPage() {
  return (
    <ComingSoon
      title="Admin · Security"
      breadcrumb="Security"
      milestone="Tenant admin V2"
      lede="Tenant security posture — audit log explorer, session policy, SSO configuration, IP allowlisting, and break-glass access."
      bullets={[
        "Audit-log viewer with filter by actor / action / date",
        "Session timeout + MFA enforcement per role",
        "SSO / SAML configuration (Okta, Azure AD, Google)",
        "IP allowlist for admin roles",
        "Break-glass access + post-access review workflow",
        "BAA + HIPAA compliance report export",
      ]}
      relatedLinks={[{ label: "Members", href: "/admin/members" }]}
    />
  );
}
