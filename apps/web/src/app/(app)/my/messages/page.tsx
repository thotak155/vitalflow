import { ComingSoon } from "../../../../components/coming-soon.js";

export default function MyMessagesPage() {
  return (
    <ComingSoon
      title="My messages"
      breadcrumb="Messages"
      milestone="Patient portal V2"
      lede="Secure two-way messaging with your care team. HIPAA-compliant, audit-logged, with automatic routing to the right clinician."
      bullets={[
        "Threaded conversations per topic",
        "Attach documents or photos",
        "Mark as non-urgent vs urgent (urgent routes to triage)",
        "Care-team response time expectations",
        "Message archive retained per HIPAA requirements",
      ]}
    />
  );
}
