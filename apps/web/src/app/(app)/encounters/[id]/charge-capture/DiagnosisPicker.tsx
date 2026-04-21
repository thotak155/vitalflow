import type { EncounterDiagnosis } from "./getChargeCaptureContext.js";

/**
 * Multi-select ICD-10 picker rendered as a comma-separated text input
 * pre-filled with the encounter's diagnosis codes.
 *
 * V1 uses a simple text input — no combobox JS. Chips are rendered
 * above the input as visual confirmation of what the encounter has on file;
 * the input itself is the source of truth the server action parses (CSV or
 * whitespace-separated).
 *
 * Once AI-suggestion import lands, a "Pick from AI suggestions" expandable
 * section shows accepted ICD-10s from the encounter's scribe session.
 */
export function DiagnosisPicker({
  encounterDiagnoses,
  defaultValue = [],
  name,
  inputId,
}: {
  encounterDiagnoses: readonly EncounterDiagnosis[];
  defaultValue?: readonly string[];
  name: string;
  inputId: string;
}) {
  const effective = defaultValue.length > 0 ? defaultValue : encounterDiagnoses.map((d) => d.code);
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-xs font-medium text-slate-700">
        ICD-10 diagnoses
      </label>

      {encounterDiagnoses.length > 0 ? (
        <div className="flex flex-wrap gap-1 text-[11px]">
          <span className="text-slate-500">on encounter:</span>
          {encounterDiagnoses.map((d) => (
            <code
              key={d.code}
              className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700"
              title={d.description}
            >
              {d.code}
            </code>
          ))}
        </div>
      ) : (
        <p className="text-[11px] italic text-slate-500">
          No diagnoses on this encounter yet. Enter ICD-10 codes below or add them from the Clinical
          note card first.
        </p>
      )}

      <input
        id={inputId}
        name={name}
        defaultValue={effective.join(", ")}
        placeholder="J02.9, R50.9"
        pattern="^\s*([A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?)(\s*[, ]\s*[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?)*\s*$"
        title="Comma-separated ICD-10-CM codes (e.g. J02.9, R50.9)"
        className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
      />
      <p className="text-[11px] text-slate-500">
        Required at post time. Separate multiple codes with commas.
      </p>
    </div>
  );
}
