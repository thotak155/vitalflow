import { ComingSoon } from "../../../components/coming-soon.js";

export default function TasksPage() {
  return (
    <ComingSoon
      title="Tasks"
      milestone="Ships with workflow engine (M2)"
      lede="Clinical and operational work items — unsigned notes, stale drafts, outstanding charges, pending refills, appointment confirmations."
      bullets={[
        "Unsigned clinical notes nearing compliance threshold",
        "Draft charges older than 24 hours",
        "Pending Rx refills",
        "Patient appointments needing confirmation",
        "Configurable due dates + assignees",
      ]}
      relatedLinks={[
        { label: "Encounters", href: "/encounters" },
        { label: "Claims", href: "/billing/claims" },
      ]}
    />
  );
}
