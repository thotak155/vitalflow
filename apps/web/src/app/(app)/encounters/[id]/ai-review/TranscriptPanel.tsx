import type { AIScribeTranscriptSegment } from "@vitalflow/types";

/**
 * Collapsible transcript. Pure `<details>` — no JS.
 *
 * Each segment has `id={`seg-${segment.id}`}` so that source-trace pills
 * elsewhere on the card (`<a href="#seg-<uuid>">`) scroll the panel to the
 * cited segment when clicked.
 */
export function TranscriptPanel({ segments }: { segments: readonly AIScribeTranscriptSegment[] }) {
  if (segments.length === 0) {
    return <p className="my-3 text-sm italic text-slate-500">No transcript segments yet.</p>;
  }
  return (
    <details className="my-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        Transcript ({segments.length} segment{segments.length === 1 ? "" : "s"}) — click to expand
      </summary>
      <ol className="mt-3 space-y-2 text-sm">
        {segments.map((seg) => (
          <li
            key={seg.id}
            id={`seg-${seg.id}`}
            className="scroll-mt-24 rounded border border-slate-100 bg-white p-2"
          >
            <div className="mb-1 flex items-center gap-2 font-mono text-[11px] text-slate-500">
              <span>#{seg.sequenceIndex}</span>
              <span className="opacity-70">{shortId(seg.id)}</span>
              {typeof seg.startMs === "number" && typeof seg.endMs === "number" ? (
                <span>
                  {formatMs(seg.startMs)}–{formatMs(seg.endMs)}
                </span>
              ) : null}
              {seg.speaker ? <span className="font-semibold">{seg.speaker}</span> : null}
            </div>
            <p className="whitespace-pre-wrap text-slate-800">{seg.text}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
