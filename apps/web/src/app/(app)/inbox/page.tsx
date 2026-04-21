import { ComingSoon } from "../../../components/coming-soon.js";

export default function InboxPage() {
  return (
    <ComingSoon
      title="Inbox"
      milestone="Ships with notifications & tasks (M2)"
      lede="Your shared work inbox — lab results awaiting review, patient messages, AI draft notifications, and appointment requests routed to you as the assignee."
      bullets={[
        "Lab / imaging results requiring physician sign-off",
        "Patient messages from the portal",
        "Pending denials assigned to you (from /billing/denials)",
        "AI scribe drafts ready for review (from encounter workspaces)",
        "Priority sort, snooze, and assign-to-colleague",
      ]}
      relatedLinks={[
        { label: "Encounters — see today's visits", href: "/encounters" },
        { label: "Denials queue", href: "/billing/denials" },
      ]}
    />
  );
}
