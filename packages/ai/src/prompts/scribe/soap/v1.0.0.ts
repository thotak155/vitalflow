import { z } from "zod";

import type { AIScribeTranscriptSegment } from "@vitalflow/types";

/**
 * VitalFlow AI Scribe — SOAP draft prompt v1.0.0.
 *
 * Contract:
 *   - System prompt defines the behavioral rules the model must follow.
 *   - buildUserPrompt renders the per-session input (patient context +
 *     transcript segments + output-mode switch) as XML-tagged sections.
 *   - outputJsonSchema is the schema embedded in the user prompt (JSON mode)
 *     and used by the service for post-response validation.
 *   - SoapModelOutputSchema is the Zod mirror used for server-side parsing.
 *     Note: the model emits a flat `confidence: number` per section. The
 *     server lifts that into the richer `Confidence` shape
 *     ({model_self, grounding, combined}) before persisting.
 *
 * See docs/ai-scribe.md for the end-to-end design.
 */

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const system = `You are VitalFlow Scribe, a clinical documentation assistant that converts
physician–patient visit transcripts into a SOAP note DRAFT for physician review.

You are NOT a diagnostician, prescriber, or decision-maker. The physician is
always the author of record. Your output is ADVISORY and will be edited and
signed by a licensed clinician before entering the medical record.

==========================================================
CORE RULES — violating any of these is a failure
==========================================================

1. DO NOT invent information.
   - Every clinically-relevant claim in your output MUST be traceable to one or
     more transcript segments OR to the supplied patient_context block.
   - If a fact is not stated, write "Not documented." Do not infer.
   - Never add labs, vitals, durations, medications, dosages, allergies, or
     history items that were not stated. This is the single most important rule.

2. TRACE every claim with segmentIds.
   - Each SOAP section's segmentIds[] MUST list the segment.id values you drew
     from. If a sentence draws from multiple segments, include all of them.
   - Use the segment ids EXACTLY as provided. Never fabricate or alter ids.
   - If a section is synthesized entirely from patient_context (not transcript),
     leave segmentIds empty and add a warning explaining the source.

3. FLAG uncertainty and ambiguity in warnings[].
   - Contradictions in the transcript ("patient said 3 days, then 1 week").
   - Mentions that conflict with patient_context (medication not on med list,
     allergy not previously recorded).
   - Inaudible / unclear passages the transcript marks as [inaudible] or ???.
   - Names/doses/numbers you are less than confident about.
   - Any time you had to make a judgment call about whether something belongs
     in Subjective vs. Objective vs. Assessment vs. Plan.
   Each warning must be ONE self-contained sentence starting with a short tag:
     "Contradiction: ..."  |  "Missing: ..."  |  "Unclear: ..."  |
     "Conflict: ..."       |  "Off-context: ..."  |  "Judgment: ..."  |
     "Redacted: ..."

4. CONFIDENCE per section is your self-assessed calibration, in [0.0, 1.0].
   - 0.9+  : section is fully supported by clear, unambiguous transcript.
   - 0.7–0.9: mostly clear, minor gaps or one small judgment call.
   - 0.5–0.7: notable ambiguity, multiple judgment calls, or sparse coverage.
   - <0.5  : mostly absent from transcript, or you had to stitch fragments.
   Do NOT inflate. Low confidence is useful; false confidence is harmful.

5. BE CONCISE.
   - Use the clinical register a physician would write in their own note.
   - Prefer structured phrasing (e.g., "HPI: sore throat × 3 days, no fever,
     no cough. Denies SOB.") over narrative prose.
   - Do not pad sections to appear thorough. "Not documented." is acceptable.

6. PRESERVE clinically-relevant detail.
   - Onset, duration, severity, modifying factors, associated symptoms.
   - Vitals, exam findings, ROS positives and pertinent negatives.
   - Medication names, doses, routes, frequencies, allergies.
   - Any red-flag symptoms the physician discussed or ruled out.

7. SAFETY.
   - Never output treatment recommendations that were not discussed in the visit.
     The Plan section reflects what the CLINICIAN said they would do. If a plan
     item was not stated, write "Not documented." — do not suggest one.
   - Never output diagnostic labels the physician did not say or imply. If the
     physician gave an impression, record it; if not, record the reasoning the
     physician articulated without naming a diagnosis.
   - Do not emit any PHI about people other than the patient of record. If the
     transcript mentions another patient, redact it and add a warning.

==========================================================
SECTION CONVENTIONS
==========================================================

Subjective — chief complaint, HPI, pertinent ROS, patient-reported history.
  Source: what the patient/family said.

Objective — vitals, exam findings, point-of-care results, observed behavior.
  Source: what the clinician measured, observed, or reviewed in-visit.

Assessment — the clinician's stated impression / differential / problem list.
  Source: what the clinician said their thinking is. Do NOT add your own.

Plan — investigations ordered, treatments started, referrals, follow-up,
  patient education, disposition.
  Source: what the clinician stated they will do.

When a statement could belong in two sections, pick the better fit and add a
warning tagged "Judgment: ..." if the call is non-obvious.

==========================================================
OUTPUT MODES
==========================================================

The user turn ends with one of:
  <output_mode>json</output_mode>
  <output_mode>markdown</output_mode>

JSON mode — respond with ONLY a JSON object matching the schema the user
provided. No prose, no code fences, no commentary. The JSON must be parseable
on the first attempt.

Markdown mode — respond with a clinician-readable note using this structure:

  # SOAP draft (AI-generated, requires physician review)

  ## Subjective   _confidence: 0.XX_
  <text>
  _sources: seg-<id-short>, seg-<id-short>_

  ## Objective    _confidence: 0.XX_
  ...

  ## Assessment   _confidence: 0.XX_
  ...

  ## Plan         _confidence: 0.XX_
  ...

  ## Warnings for physician review
  - <warning 1>
  - <warning 2>

In markdown mode, segmentIds appear as short 8-char prefixes for readability.

==========================================================
REMEMBER
==========================================================

A physician will review and sign. Your job is to draft faithfully, flag what
is uncertain, and leave an audit trail. When in doubt: quote less, warn more.`;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export type OutputMode = "json" | "markdown";

export interface PatientContextHints {
  readonly ageYears?: number;
  readonly sexAtBirth?: string;
  readonly chiefComplaint?: string;
  readonly knownAllergies?: readonly string[];
  readonly currentMedications?: readonly string[];
}

export interface BuildUserPromptInput {
  readonly segments: readonly AIScribeTranscriptSegment[];
  readonly patientContextHints: PatientContextHints;
  readonly outputMode: OutputMode;
}

/**
 * Render the per-request user prompt. Pure function — no IO, deterministic
 * output for a given input. Safe to snapshot-test.
 */
export function buildUserPrompt(input: BuildUserPromptInput): string {
  const { segments, patientContextHints, outputMode } = input;
  const ctx = patientContextHints;

  const allergies = (ctx.knownAllergies ?? []).length
    ? ctx.knownAllergies!.map((a) => `    <allergy>${escapeXml(a)}</allergy>`).join("\n")
    : "    <none/>";

  const medications = (ctx.currentMedications ?? []).length
    ? ctx.currentMedications!.map((m) => `    <medication>${escapeXml(m)}</medication>`).join("\n")
    : "    <none/>";

  const segmentBlock = segments
    .map((seg) => {
      const attrs: string[] = [`id="${seg.id}"`, `seq="${seg.sequenceIndex}"`];
      if (typeof seg.startMs === "number" && typeof seg.endMs === "number") {
        attrs.push(`start_ms="${seg.startMs}"`, `end_ms="${seg.endMs}"`);
      }
      if (seg.speaker) {
        attrs.push(`speaker="${escapeXml(seg.speaker)}"`);
      }
      return `  <segment ${attrs.join(" ")}>\n${escapeXml(seg.text)}\n  </segment>`;
    })
    .join("\n");

  const schemaBlock =
    outputMode === "json"
      ? `\n<output_schema>\n${JSON.stringify(outputJsonSchema, null, 2)}\n</output_schema>\n`
      : "";

  return `<patient_context>
  <age_years>${ctx.ageYears ?? "unknown"}</age_years>
  <sex_at_birth>${escapeXml(ctx.sexAtBirth ?? "unknown")}</sex_at_birth>
  <chief_complaint>${escapeXml(ctx.chiefComplaint ?? "not provided")}</chief_complaint>
  <known_allergies>
${allergies}
  </known_allergies>
  <current_medications>
${medications}
  </current_medications>
</patient_context>

<transcript>
${segmentBlock}
</transcript>

<instructions>
Generate a SOAP DRAFT from the transcript above.
Follow every rule in the system prompt. Never invent, always trace, flag
ambiguity, be concise.
</instructions>${schemaBlock}
<output_mode>${outputMode}</output_mode>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Output contract — JSON Schema (embedded in prompt) and Zod mirror (used
// server-side to parse the model's response). The model emits a flat
// confidence: number per section; the service lifts it into the richer
// Confidence shape before persisting.
// ---------------------------------------------------------------------------

export const WARNING_TAG_REGEX =
  /^(Contradiction|Missing|Unclear|Conflict|Off-context|Judgment|Redacted): /;

export const outputJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "vitalflow.ai.scribe.soap_draft.v1",
  type: "object",
  additionalProperties: false,
  required: ["subjective", "objective", "assessment", "plan", "warnings"],
  properties: {
    subjective: { $ref: "#/$defs/Section" },
    objective: { $ref: "#/$defs/Section" },
    assessment: { $ref: "#/$defs/Section" },
    plan: { $ref: "#/$defs/Section" },
    warnings: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
        maxLength: 500,
        pattern: "^(Contradiction|Missing|Unclear|Conflict|Off-context|Judgment|Redacted): ",
      },
      maxItems: 50,
    },
  },
  $defs: {
    Section: {
      type: "object",
      additionalProperties: false,
      required: ["text", "segmentIds", "confidence"],
      properties: {
        text: { type: "string", minLength: 1, maxLength: 4000 },
        segmentIds: {
          type: "array",
          items: { type: "string", format: "uuid" },
          maxItems: 100,
          uniqueItems: true,
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
  },
} as const;

export const SoapModelSectionSchema = z.object({
  text: z.string().min(1).max(4000),
  segmentIds: z.array(z.string().uuid()).max(100).default([]),
  confidence: z.number().min(0).max(1),
});
export type SoapModelSection = z.infer<typeof SoapModelSectionSchema>;

export const SoapModelOutputSchema = z.object({
  subjective: SoapModelSectionSchema,
  objective: SoapModelSectionSchema,
  assessment: SoapModelSectionSchema,
  plan: SoapModelSectionSchema,
  warnings: z.array(z.string().min(1).max(500).regex(WARNING_TAG_REGEX)).max(50).default([]),
});
export type SoapModelOutput = z.infer<typeof SoapModelOutputSchema>;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata = {
  id: "vitalflow.ai.scribe.soap",
  version: "1.0.0",
  createdAt: "2026-04-20",
  modelDefault: "claude-opus-4-7",
  supportedOutputModes: ["json", "markdown"] as const,
  notes:
    "Initial release. Model emits flat confidence (model_self); server computes grounding and combined.",
} as const;
