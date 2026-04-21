import type { AppSession } from "../../../../../lib/session.js";

import { AIReviewIntakePanel } from "./AIReviewIntakePanel.js";
import { AIReviewPanel } from "./AIReviewPanel.js";
import { AIReviewProgressPanel } from "./AIReviewProgressPanel.js";
import { getAIReviewContext } from "./getAIReviewContext.js";
import { AIReviewSummaryCard } from "./shared.js";

/**
 * Top-level entry for the AI scribe review card. Renders nothing when the
 * user lacks `ai:invoke`. Otherwise dispatches to one of four sub-panels
 * based on the latest session's status.
 *
 * Usage: `<AIReviewCard encounterId={id} patientId={patient_id} session={appSession} searchParams={searchParams} />`
 * Place between the Clinical-note card and the Documents card on the
 * encounter page.
 */
export async function AIReviewCard({
  encounterId,
  patientId,
  session,
  searchParams,
}: {
  encounterId: string;
  patientId: string;
  session: AppSession;
  /**
   * The encounter page already accepts searchParams for banner rendering.
   * We read `showLow` here so the UI can toggle low-confidence codes via
   * URL without any client-side JS.
   */
  searchParams: { showLow?: string };
}) {
  const ctx = await getAIReviewContext(encounterId, session);
  if (!ctx.permissions.canView) return null;

  const showLow = searchParams.showLow === "1";

  const s = ctx.session;

  // State A — no session
  if (!s) {
    return <AIReviewIntakePanel encounterId={encounterId} canStart={ctx.permissions.canStart} />;
  }

  // State D — terminal
  if (s.status === "accepted") {
    return (
      <AIReviewSummaryCard
        status="accepted"
        acceptedCodeCount={ctx.codes.filter((c) => c.acceptedAt).length}
      />
    );
  }
  if (s.status === "rejected") {
    return <AIReviewSummaryCard status="rejected" />;
  }
  if (s.status === "cancelled") {
    return <AIReviewSummaryCard status="cancelled" />;
  }

  // State C — awaiting review, draft + codes must be present
  if (s.status === "awaiting_review" && ctx.draft) {
    return (
      <AIReviewPanel
        encounterId={encounterId}
        patientId={patientId}
        session={s}
        segments={ctx.segments}
        draft={ctx.draft}
        codes={ctx.codes}
        showLowConfidenceCodes={showLow}
        canAccept={ctx.permissions.canAccept}
        canReject={ctx.permissions.canReject}
        encounterHasSignedNote={ctx.encounterHasSignedNote}
      />
    );
  }

  // State B — in progress (pending, transcribing, generating, suggesting_codes, failed, awaiting_review-but-no-draft)
  return (
    <AIReviewProgressPanel
      encounterId={encounterId}
      session={s}
      canCancel={ctx.permissions.canCancel}
    />
  );
}
