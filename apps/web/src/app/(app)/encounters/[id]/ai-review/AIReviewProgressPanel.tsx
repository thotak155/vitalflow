import type { AIScribeSession } from "@vitalflow/types";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Textarea,
} from "@vitalflow/ui";

import { cancelScribeSession, refreshAIReview, submitTranscript } from "./actions.js";

/**
 * State B — session is created and the pipeline is (or will be) running.
 *
 * Two sub-shapes depending on the session source:
 *   1. source=transcript_paste, status=pending → show the paste textarea so
 *      the user can submit the actual transcript.
 *   2. any status in (transcribing | generating | suggesting_codes) → show
 *      a step list with refresh + cancel buttons.
 *
 * `failed` is rendered inline as a prominent error block inside this same panel.
 */
export function AIReviewProgressPanel({
  encounterId,
  session,
  canCancel,
}: {
  encounterId: string;
  session: AIScribeSession;
  canCancel: boolean;
}) {
  const isPasteWaitingForText =
    session.source === "transcript_paste" && session.status === "pending";

  return (
    <Card data-testid="ai-review-progress">
      <CardHeader>
        <CardTitle className="text-base">AI scribe · {formatStatus(session.status)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPasteWaitingForText ? (
          <PasteTranscriptForm encounterId={encounterId} sessionId={session.id} />
        ) : (
          <StepList session={session} />
        )}

        {session.status === "failed" && session.errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-semibold">Generation failed</p>
            <p className="font-mono text-xs">{session.errorMessage}</p>
          </div>
        ) : null}

        {!isPasteWaitingForText ? (
          <div className="flex items-center gap-2">
            <form action={refreshAIReview}>
              <input type="hidden" name="encounter_id" value={encounterId} />
              <Button type="submit" size="sm" variant="outline">
                Refresh status
              </Button>
            </form>
            {canCancel ? (
              <form action={cancelScribeSession}>
                <input type="hidden" name="encounter_id" value={encounterId} />
                <input type="hidden" name="session_id" value={session.id} />
                <Button type="submit" size="sm" variant="ghost">
                  Cancel session
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatStatus(status: AIScribeSession["status"]): string {
  switch (status) {
    case "pending":
      return "awaiting transcript";
    case "transcribing":
      return "transcribing audio";
    case "generating":
      return "generating draft";
    case "suggesting_codes":
      return "suggesting codes";
    case "awaiting_review":
      return "awaiting review";
    case "failed":
      return "failed";
    default:
      return status;
  }
}

function StepList({ session }: { session: AIScribeSession }) {
  const rows: readonly [label: string, step: "transcribe" | "generate" | "suggest"][] = [
    ["Transcribe", "transcribe"],
    ["Synthesize SOAP", "generate"],
    ["Suggest codes", "suggest"],
  ];
  const status = session.status;
  return (
    <ol className="space-y-1 text-sm">
      {rows.map(([label, step]) => {
        const state = deriveStepState(status, step);
        return (
          <li key={step} className="flex items-center gap-2">
            <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${dotColor(state)}`} />
            <span className="font-medium text-slate-800">{label}</span>
            <span className="text-xs text-slate-500">— {state}</span>
          </li>
        );
      })}
    </ol>
  );
}

function deriveStepState(
  session: AIScribeSession["status"],
  step: "transcribe" | "generate" | "suggest",
): "pending" | "running" | "completed" | "skipped" | "failed" {
  if (session === "failed") return "failed";
  const order = ["transcribe", "generate", "suggest"] as const;
  const idx = order.indexOf(step);
  const current = (() => {
    switch (session) {
      case "pending":
        return -1;
      case "transcribing":
        return 0;
      case "generating":
        return 1;
      case "suggesting_codes":
        return 2;
      case "awaiting_review":
      case "accepted":
      case "rejected":
        return 3;
      default:
        return -1;
    }
  })();
  if (idx < current) return "completed";
  if (idx === current) return "running";
  return "pending";
}

function dotColor(state: string): string {
  switch (state) {
    case "completed":
      return "bg-emerald-500";
    case "running":
      return "bg-amber-400 animate-pulse";
    case "failed":
      return "bg-red-500";
    case "skipped":
      return "bg-slate-300";
    default:
      return "bg-slate-200";
  }
}

function PasteTranscriptForm({
  encounterId,
  sessionId,
}: {
  encounterId: string;
  sessionId: string;
}) {
  return (
    <form action={submitTranscript} className="space-y-3">
      <input type="hidden" name="encounter_id" value={encounterId} />
      <input type="hidden" name="session_id" value={sessionId} />
      <FormField
        label="Transcript text"
        htmlFor="ai-scribe-transcript"
        helper="Paste the visit transcript. 10–200,000 characters."
      >
        <Textarea
          id="ai-scribe-transcript"
          name="text"
          rows={10}
          required
          minLength={10}
          maxLength={200_000}
          className="font-mono text-xs"
          placeholder="Patient reports sore throat for 3 days..."
        />
      </FormField>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="default">
          Submit transcript
        </Button>
        <span className="text-xs text-slate-500">The pipeline kicks off automatically.</span>
      </div>
    </form>
  );
}
