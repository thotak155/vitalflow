import type { AIScribeCodeSuggestion, SoapDraft, SoapSection } from "@vitalflow/types";
import { Button, FormField, Textarea } from "@vitalflow/ui";

import { acceptDraft, rejectDraft } from "./actions.js";
import { CodeSuggestionList } from "./CodeSuggestionList.js";
import { ConfidencePill } from "./shared.js";

/**
 * State C body. Two forms side-by-side:
 *   - Accept form: 4 SOAP section textareas + code checkboxes + Accept
 *   - Reject form: reason textarea + Reject
 *
 * The 4 textareas come prefilled with the AI draft; the physician edits
 * in place. Source trace pills and per-section confidence pills render
 * above each textarea. All form fields are uncontrolled — state lives in
 * the DOM and is POSTed on submit.
 */
export function SoapDraftForm({
  encounterId,
  sessionId,
  patientId,
  draft,
  codes,
  showLowConfidenceCodes,
  canAccept,
  canReject,
  encounterHasSignedNote,
}: {
  encounterId: string;
  sessionId: string;
  patientId: string;
  draft: SoapDraft;
  codes: readonly AIScribeCodeSuggestion[];
  showLowConfidenceCodes: boolean;
  canAccept: boolean;
  canReject: boolean;
  encounterHasSignedNote: boolean;
}) {
  return (
    <div className="space-y-4">
      {encounterHasSignedNote ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          This encounter already has a signed note. The draft is shown for review only — accept is
          disabled. To incorporate AI content, use the existing amend flow on the Clinical note
          card.
        </div>
      ) : null}

      {/* -------------------- Accept form -------------------- */}
      <form action={acceptDraft} className="space-y-4" id="ai-review-accept-form">
        <input type="hidden" name="encounter_id" value={encounterId} />
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="patient_id" value={patientId} />

        <SoapSectionField name="subjective" label="Subjective" section={draft.subjective} />
        <SoapSectionField name="objective" label="Objective" section={draft.objective} />
        <SoapSectionField name="assessment" label="Assessment" section={draft.assessment} />
        <SoapSectionField name="plan" label="Plan" section={draft.plan} />

        <CodeSuggestionList
          codes={codes}
          showLow={showLowConfidenceCodes}
          encounterId={encounterId}
        />

        <div className="flex items-center gap-3 border-t border-slate-200 pt-3">
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={!canAccept || encounterHasSignedNote}
          >
            Accept into note as draft
          </Button>
          <p className="text-xs text-slate-500">
            Creates a new <code>encounter_notes</code> row with <code>ai_assisted=true</code>.
            Signing is a separate step on the Clinical note card above.
          </p>
        </div>
      </form>

      {/* -------------------- Reject form -------------------- */}
      <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          Reject draft…
        </summary>
        <form action={rejectDraft} className="mt-3 space-y-3">
          <input type="hidden" name="encounter_id" value={encounterId} />
          <input type="hidden" name="session_id" value={sessionId} />
          <FormField
            label="Reason for rejection"
            htmlFor="ai-reject-reason"
            helper="At least 5 characters. Feedback is saved to ai_feedback for future prompt tuning."
          >
            <Textarea
              id="ai-reject-reason"
              name="reason"
              rows={3}
              required
              minLength={5}
              maxLength={1000}
            />
          </FormField>
          <FormField
            label="Correction (optional)"
            htmlFor="ai-reject-correction"
            helper="What should the draft have said instead? Helps improve future drafts."
          >
            <Textarea id="ai-reject-correction" name="correction" rows={3} maxLength={5000} />
          </FormField>
          <Button type="submit" variant="destructive" size="sm" disabled={!canReject}>
            Reject draft
          </Button>
        </form>
      </details>
    </div>
  );
}

function SoapSectionField({
  name,
  label,
  section,
}: {
  name: "subjective" | "objective" | "assessment" | "plan";
  label: string;
  section: SoapSection;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        <ConfidencePill confidence={section.confidence} />
        {section.segmentIds.length > 0 ? (
          <span className="font-mono text-[11px] text-slate-500">
            sources:{" "}
            {section.segmentIds.map((id, i) => (
              <span key={id}>
                <a href={`#seg-${id}`} className="underline hover:text-sky-600">
                  seg-{id.slice(0, 8)}
                </a>
                {i < section.segmentIds.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <Textarea
        name={name}
        id={`ai-draft-${name}`}
        rows={4}
        defaultValue={section.text}
        className="w-full"
      />
    </div>
  );
}
