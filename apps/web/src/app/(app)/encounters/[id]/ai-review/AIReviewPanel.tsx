import type {
  AIScribeCodeSuggestion,
  AIScribeSession,
  AIScribeTranscriptSegment,
  SoapDraft,
} from "@vitalflow/types";
import { Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";

import { SoapDraftForm } from "./SoapDraftForm.js";
import { TranscriptPanel } from "./TranscriptPanel.js";
import { AIDraftChip, WarningsBanner } from "./shared.js";

/**
 * State C — the main review surface. Yellow-tinted card with the AI DRAFT
 * chip, warnings banner, collapsible transcript, editable SOAP sections,
 * and code-suggestion checkboxes.
 */
export function AIReviewPanel({
  encounterId,
  session,
  patientId,
  segments,
  draft,
  codes,
  showLowConfidenceCodes,
  canAccept,
  canReject,
  encounterHasSignedNote,
}: {
  encounterId: string;
  session: AIScribeSession;
  patientId: string;
  segments: readonly AIScribeTranscriptSegment[];
  draft: SoapDraft;
  codes: readonly AIScribeCodeSuggestion[];
  showLowConfidenceCodes: boolean;
  canAccept: boolean;
  canReject: boolean;
  encounterHasSignedNote: boolean;
}) {
  return (
    <Card id="ai-review" className="border-amber-300 bg-amber-50/40" data-testid="ai-review-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          AI scribe · <AIDraftChip /> — not yet in chart
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <WarningsBanner warnings={draft.warnings} />

        <TranscriptPanel segments={segments} />

        <SoapDraftForm
          encounterId={encounterId}
          sessionId={session.id}
          patientId={patientId}
          draft={draft}
          codes={codes}
          showLowConfidenceCodes={showLowConfidenceCodes}
          canAccept={canAccept}
          canReject={canReject}
          encounterHasSignedNote={encounterHasSignedNote}
        />
      </CardContent>
    </Card>
  );
}
