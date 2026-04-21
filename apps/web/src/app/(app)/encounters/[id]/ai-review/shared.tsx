import { Badge, Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";
import { AlertCircle, CheckCircle2 } from "@vitalflow/ui/icons";
import type { Confidence } from "@vitalflow/types";

// ---------------------------------------------------------------------------
// ConfidencePill — colored badge driven by Confidence.combined
// ---------------------------------------------------------------------------

/**
 * Color bands match `docs/ai-scribe.md §6.3`:
 *   combined >= 0.8 → green "Confident"
 *   0.5 .. 0.8      → amber "Review"
 *   < 0.5           → red "Low confidence"
 */
export function ConfidencePill({
  confidence,
  showValue = true,
}: {
  confidence: Confidence;
  showValue?: boolean;
}) {
  const combined = confidence.combined;
  const tone: "success" | "warning" | "destructive" =
    combined >= 0.8 ? "success" : combined >= 0.5 ? "warning" : "destructive";
  const label = combined >= 0.8 ? "Confident" : combined >= 0.5 ? "Review" : "Low confidence";
  return (
    <Badge variant={tone} className="gap-1 text-xs">
      <span>{label}</span>
      {showValue ? (
        <span className="tabular-nums opacity-80">·&nbsp;{combined.toFixed(2)}</span>
      ) : null}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// WarningsBanner — grouped by tag prefix
// ---------------------------------------------------------------------------

const WARNING_TAG_ORDER: readonly string[] = [
  "Contradiction",
  "Conflict",
  "Missing",
  "Unclear",
  "Off-context",
  "Unsupported",
  "Overcoding",
  "Judgment",
  "Redacted",
];

function splitTag(warning: string): { tag: string; body: string } {
  const m = /^([A-Z][A-Za-z-]+):\s+(.*)$/.exec(warning);
  if (m && m[1] && m[2]) return { tag: m[1], body: m[2] };
  return { tag: "Unclear", body: warning };
}

export function WarningsBanner({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;

  const grouped = new Map<string, string[]>();
  for (const w of warnings) {
    const { tag, body } = splitTag(w);
    if (!grouped.has(tag)) grouped.set(tag, []);
    grouped.get(tag)!.push(body);
  }

  const orderedTags = WARNING_TAG_ORDER.filter((t) => grouped.has(t));
  for (const t of grouped.keys()) if (!orderedTags.includes(t)) orderedTags.push(t);

  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <AlertCircle className="h-4 w-4" aria-hidden />
        <span>
          {warnings.length} warning{warnings.length === 1 ? "" : "s"} for physician review
        </span>
      </div>
      <ul className="ml-6 list-disc space-y-1">
        {orderedTags.map((tag) => (
          <li key={tag}>
            <span className="font-semibold">{tag}:</span>{" "}
            {grouped.get(tag)!.map((b, i, arr) => (
              <span key={`${tag}-${i}`}>
                {b}
                {i < arr.length - 1 ? "; " : ""}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AIReviewSummaryCard — state D (accepted / rejected / cancelled)
// ---------------------------------------------------------------------------

export function AIReviewSummaryCard({
  status,
  acceptedCodeCount,
  noteVersion,
  rejectedReason,
}: {
  status: "accepted" | "rejected" | "cancelled";
  acceptedCodeCount?: number;
  noteVersion?: number;
  rejectedReason?: string;
}) {
  const icon =
    status === "accepted" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
    ) : (
      <AlertCircle className="h-4 w-4 text-slate-500" aria-hidden />
    );
  const title =
    status === "accepted"
      ? `AI scribe · accepted into note${noteVersion ? ` v${noteVersion}` : ""}`
      : status === "rejected"
        ? "AI scribe · draft rejected"
        : "AI scribe · session cancelled";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-slate-700">
        {status === "accepted" && typeof acceptedCodeCount === "number" ? (
          <p>
            {acceptedCodeCount} suggested code{acceptedCodeCount === 1 ? "" : "s"} accepted.
          </p>
        ) : null}
        {status === "rejected" && rejectedReason ? (
          <p className="italic">Reason: {rejectedReason}</p>
        ) : null}
        <p className="text-xs text-slate-500">
          The signing step remains on the Clinical note card above.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DraftHeaderChip — yellow "AI DRAFT" chip for state C
// ---------------------------------------------------------------------------

export function AIDraftChip() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
      aria-label="This content is an AI-generated draft and has not been accepted into the chart"
    >
      AI DRAFT
    </span>
  );
}
