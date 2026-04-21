import { Button, Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";

import { startScribeSession } from "./actions.js";

/**
 * State A — no active session. The user picks a source and starts one.
 *
 * We render TWO forms on the same card:
 *   - left: "Paste transcript" — direct text submission
 *   - right: "Upload audio" — placeholder (requires storage signed URL flow
 *     which the orchestrator owns; scaffold shows the button disabled with
 *     a note so the UI shape is visible).
 *
 * For the paste path we inline two server actions: first `startScribeSession`
 * creates a session, then `submitTranscript` chunks the text. A future
 * refactor can merge these into a single action if preferred — kept split
 * here to mirror the REST API surface exactly.
 */
export function AIReviewIntakePanel({
  encounterId,
  canStart,
}: {
  encounterId: string;
  canStart: boolean;
}) {
  return (
    <Card data-testid="ai-review-intake">
      <CardHeader>
        <CardTitle className="text-base">AI scribe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Start a scribe session to generate a SOAP draft + ICD-10 / CPT suggestions for this visit.
          Output is advisory and requires physician review before entering the chart.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Paste transcript ------------------------------------------ */}
          <form
            action={async (formData: FormData) => {
              "use server";
              // Two-step: create session (returns the redirect to encounter
              // page with ?ok=...), then the user re-submits the transcript
              // via the submit action on the next card render. For the
              // scaffold, we only START here; the transcript field on the
              // progress panel picks up from there.
              await startScribeSession(formData);
            }}
            className="flex flex-col gap-3 rounded-md border border-slate-200 p-3"
          >
            <input type="hidden" name="encounter_id" value={encounterId} />
            <input type="hidden" name="source" value="transcript_paste" />
            <h4 className="text-sm font-semibold text-slate-800">Paste transcript</h4>
            <p className="text-xs text-slate-500">
              Create a session, then paste a transcript from your existing recorder.
            </p>
            <Button type="submit" disabled={!canStart} size="sm" variant="default">
              Start paste session
            </Button>
          </form>

          {/* Upload audio --------------------------------------------- */}
          <form
            action={async (formData: FormData) => {
              "use server";
              await startScribeSession(formData);
            }}
            className="flex flex-col gap-3 rounded-md border border-slate-200 p-3"
          >
            <input type="hidden" name="encounter_id" value={encounterId} />
            <input type="hidden" name="source" value="audio_upload" />
            <h4 className="text-sm font-semibold text-slate-800">Upload audio</h4>
            <p className="text-xs text-slate-500">
              Create a session that returns a signed upload URL. (Audio pipeline wires up in the
              orchestrator PR.)
            </p>
            <Button type="submit" disabled={!canStart} size="sm" variant="secondary">
              Start audio session
            </Button>
          </form>
        </div>

        {!canStart ? (
          <p className="text-xs italic text-slate-500">
            You do not have the <code>ai:invoke</code> permission on this tenant.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
