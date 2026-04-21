import type { AIScribeCodeSuggestion } from "@vitalflow/types";

import { ConfidencePill } from "./shared.js";

/**
 * Renders code suggestions as a set of `<input name="accepted_code_id">`
 * checkboxes grouped by type. Lives INSIDE the parent SOAP accept form
 * (its inputs join the form submission).
 *
 * Low-confidence (combined < 0.5) suggestions are hidden by default; a
 * server-action-driven URL toggle (`?showLow=1`) reveals them. No client
 * JS required.
 */
export function CodeSuggestionList({
  codes,
  showLow,
  encounterId,
}: {
  codes: readonly AIScribeCodeSuggestion[];
  showLow: boolean;
  encounterId: string;
}) {
  const visible = showLow ? codes : codes.filter((c) => c.confidence.combined >= 0.5);
  const hiddenCount = codes.length - visible.length;

  const diagnoses = visible.filter((c) => c.type === "diagnosis");
  const procedures = visible.filter((c) => c.type === "procedure");

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Code suggestions</h3>
        {hiddenCount > 0 ? (
          <a
            href={`/encounters/${encounterId}?showLow=1#ai-review`}
            className="text-xs text-sky-600 underline"
          >
            Show {hiddenCount} low-confidence suggestion{hiddenCount === 1 ? "" : "s"}
          </a>
        ) : showLow && codes.length > visible.length ? null : null}
        {showLow ? (
          <a
            href={`/encounters/${encounterId}#ai-review`}
            className="text-xs text-sky-600 underline"
          >
            Hide low-confidence
          </a>
        ) : null}
      </header>

      {visible.length === 0 ? (
        <p className="text-sm italic text-slate-500">
          No code suggestions at the configured confidence threshold.
        </p>
      ) : null}

      {diagnoses.length > 0 ? (
        <CodeGroup heading="Diagnoses (ICD-10-CM)" codes={diagnoses} />
      ) : null}
      {procedures.length > 0 ? (
        <CodeGroup heading="Procedures / E/M (CPT)" codes={procedures} />
      ) : null}
    </section>
  );
}

function CodeGroup({
  heading,
  codes,
}: {
  heading: string;
  codes: readonly AIScribeCodeSuggestion[];
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {heading}
      </h4>
      <ul className="space-y-2">
        {codes.map((c) => (
          <CodeRow key={c.id} code={c} />
        ))}
      </ul>
    </div>
  );
}

function CodeRow({ code }: { code: AIScribeCodeSuggestion }) {
  const inputId = `code-${code.id}`;
  return (
    <li className="rounded-md border border-slate-200 bg-white p-3">
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          name="accepted_code_id"
          value={code.id}
          className="mt-1 h-4 w-4 accent-sky-600"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-800">
              {code.code}
            </code>
            <span className="font-medium text-slate-900">{code.description}</span>
            <ConfidencePill confidence={code.confidence} />
            <span className="text-[11px] uppercase tracking-wide text-slate-400">
              rank {code.rank}
            </span>
            <SourceBadge source={code.source} />
          </div>
          <p className="mt-1 text-xs text-slate-700">
            <span className="font-semibold">why: </span>
            {code.rationale || <span className="italic text-slate-500">no rationale</span>}
          </p>
          {code.missingDocumentation.length > 0 ? (
            <p className="mt-1 text-xs text-amber-800">
              <span className="font-semibold">missing: </span>
              {code.missingDocumentation.join("; ")}
            </p>
          ) : null}
          {code.segmentIds.length > 0 ? (
            <p className="mt-1 font-mono text-[11px] text-slate-500">
              sources:{" "}
              {code.segmentIds.map((id, i) => (
                <span key={id}>
                  <a href={`#seg-${id}`} className="underline hover:text-sky-600">
                    seg-{id.slice(0, 8)}
                  </a>
                  {i < code.segmentIds.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </label>
    </li>
  );
}

function SourceBadge({ source }: { source: AIScribeCodeSuggestion["source"] }) {
  const label =
    source === "transcript" ? "transcript" : source === "soap_only" ? "soap" : "context";
  return (
    <span className="rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
      {label}
    </span>
  );
}
