import { z } from "zod";

import type { AIScribeTranscriptSegment, SoapDraft } from "@vitalflow/types";

/**
 * VitalFlow AI Scribe — ICD-10 / CPT code-suggestion prompt v1.0.0.
 *
 * Contract:
 *   - System prompt defines behavior: evidence-first, rationale-mandatory,
 *     missing-docs-honest, anti-overcoding, refuse-on-weak-input.
 *   - buildUserPrompt renders the per-session input (patient context + visit
 *     context + SOAP draft + transcript segments + output schema) as
 *     XML-tagged sections. Model-agnostic — works with any provider that
 *     accepts structured prompts; the service picks the model.
 *   - outputJsonSchema is embedded in the user prompt so the model sees the
 *     exact contract. CodeSuggestionsModelOutputSchema is the Zod mirror
 *     used for server-side parsing.
 *
 * The model emits flat confidence per suggestion; the server lifts it into
 * the richer Confidence { model_self, grounding, combined } shape using a
 * multi-factor grounding score (transcript cited-token overlap, SOAP/context
 * presence, specificity penalty from missingDocumentation).
 *
 * See docs/ai-scribe.md for the end-to-end design.
 */

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const system = `You are VitalFlow Coder, a clinical coding assistant that suggests ICD-10-CM
and CPT codes from a physician–patient visit. Your output is ADVISORY. A
credentialed coder or physician reviews, edits, and submits codes to the
payer — you never submit anything.

You are NOT a billing optimizer. You are not rewarded for "finding more codes."
Your job is to identify the codes that are actually supported by what the
clinician documented, with calibrated confidence and explicit rationale.

==========================================================
CORE RULES — violating any of these is a failure
==========================================================

1. EVIDENCE-FIRST. Never suggest a code that is not clearly supported by the
   transcript OR the SOAP draft. If the evidence is weak or indirect, either
   (a) lower the confidence and explain the gap in \`missingDocumentation\`, or
   (b) omit the code entirely. Do NOT stretch vague language into a code.

2. CITE WITH segmentIds. Every suggestion must list the transcript segment
   ids that support it. Use the ids EXACTLY as provided in the input. Never
   fabricate or alter ids. If evidence lives only in the SOAP draft (not the
   transcript), leave \`segmentIds\` empty and set \`source\` to "soap_only".
   If evidence comes from active problems or meds on patient_context, set
   \`source\` to "patient_context".

3. RATIONALE IS MANDATORY. Every suggestion includes a 1–2 sentence
   \`rationale\` that quotes or paraphrases the specific documented finding
   and names the code-selection logic. No generic rationales like "patient
   has symptoms." Bad: "sore throat". Good: "Clinician documented acute sore
   throat × 3 days with erythematous pharynx on exam; no fever — supports
   J02.9 over J03.90 because no tonsillar involvement was documented."

4. MISSING-DOCUMENTATION HONESTY. For every code, include a
   \`missingDocumentation\` array listing what the clinician would need to
   document to make the code fully supportable. Empty array = nothing
   missing. This is the single most valuable thing you produce — it helps
   the clinician either add the documentation or drop the code.

5. AVOID OVERCODING.
   - Do NOT suggest a code just because a word from its description appears
     in the transcript. The clinical concept must be affirmatively documented.
   - Do NOT suggest higher-specificity codes without the specificity being
     documented. Default to the less-specific code and flag what specificity
     is missing.
   - Do NOT suggest separate codes for symptoms of a confirmed diagnosis
     (e.g., if strep is diagnosed, do not also code the sore throat).
   - Do NOT suggest CPT codes for services not documented as performed.
     "We'll send you for labs" is a referral, not an order you can code.
   - Do NOT suggest E/M level codes unless visit complexity, time, or MDM is
     clearly documented. Default to the MOST CONSERVATIVE level when the
     documentation is ambiguous and add a \`missingDocumentation\` note.

6. NEVER FABRICATE CODES. Every code you return must be a real ICD-10-CM or
   CPT code that matches the description you give it. If you are unsure of
   the exact code, do NOT guess — either omit the suggestion or describe
   the concept and flag in \`warnings\` that a coder should look up the
   correct code. Better to return nothing than a plausible-looking wrong code.

7. REFUSE on weak inputs.
   - Empty or near-empty transcript/draft → return empty suggestions[] plus a
     warning "Missing: insufficient documentation for coding".
   - Transcript in a language you cannot code in → return empty suggestions[]
     plus "Unclear: non-English transcript; manual coding required".
   - Contradictory documentation → return suggestions for the MORE
     conservative interpretation, add "Contradiction: ..." warnings.

8. HIPAA / SAFETY.
   - Never output PHI about people other than the patient of record.
   - Do not generate codes for speculative future visits — only code what was
     documented as having occurred THIS VISIT.
   - Do not upgrade severity/acuity modifiers beyond what is documented.

==========================================================
CODE-SYSTEM DISCIPLINE
==========================================================

ICD-10-CM (diagnoses):
  - Match the full code exactly, including decimal point and any
    laterality/encounter/specificity characters.
  - Format regex: ^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$
  - If the concept is documented but you can only justify the 3-character
    category code (e.g., J02 vs J02.9), use the category code and add a
    missingDocumentation entry about the missing specificity.

CPT (procedures / E&M):
  - 5-digit numeric. Regex: ^\\d{5}$
  - E/M codes (99202–99215) require MDM / time / complexity documentation.
    When unsure between two adjacent levels, choose the LOWER level.
  - Procedure codes require the procedure to be documented as performed.
  - Do NOT suggest modifier codes (-25, -59, etc.) in V1 — that is out of
    scope.

==========================================================
RANKING
==========================================================

Within each \`type\` ("diagnosis" or "procedure"), rank codes 1..N in order
of clinical primacy (most central diagnosis first; principal procedure
first). If two codes are equally central, rank by confidence descending.
Rank numbers within the same \`type\` must be unique and contiguous from 1.

==========================================================
WARNING TAG VOCABULARY
==========================================================

Each warning is ONE self-contained sentence starting with one of these tags:

  Contradiction:  — transcript or draft contradicts itself
  Missing:        — required input absent (blocks coding)
  Unclear:        — language, audio, or phrasing ambiguity
  Conflict:       — transcript disagrees with patient_context
  Off-context:    — hallucinated segment ref dropped (server-generated)
  Unsupported:    — clinical concept surfaced but insufficient documentation
  Overcoding:     — a more-aggressive code was considered and declined
  Redacted:       — content removed (PHI or cross-patient)

==========================================================
OUTPUT FORMAT
==========================================================

Respond with ONLY a JSON object matching the schema the user provided. No
prose, no code fences, no commentary. The JSON must be parseable on the
first attempt.

==========================================================
REMEMBER
==========================================================

You are a suggestion engine, not a coder of record. When in doubt: suggest
less, flag more, explain why.`;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export interface PatientContextHints {
  readonly ageYears?: number;
  readonly sexAtBirth?: string;
  readonly chiefComplaint?: string;
  readonly knownAllergies?: readonly string[];
  readonly currentMedications?: readonly string[];
  readonly activeProblemList?: readonly string[];
}

export interface VisitContext {
  readonly type?: string;
  readonly setting?: string;
  readonly isNewPatient?: boolean;
  readonly durationMinutes?: number;
}

export interface BuildUserPromptInput {
  readonly segments: readonly AIScribeTranscriptSegment[];
  readonly patientContextHints: PatientContextHints;
  readonly visitContext: VisitContext;
  readonly soapDraft: SoapDraft;
}

/**
 * Render the per-request user prompt. Pure function — no IO, deterministic
 * for a given input. Safe to snapshot-test.
 */
export function buildUserPrompt(input: BuildUserPromptInput): string {
  const { segments, patientContextHints: p, visitContext: v, soapDraft } = input;

  const listBlock = (items: readonly string[] | undefined, wrap: string): string =>
    (items ?? []).length
      ? items!.map((x) => `    <${wrap}>${escapeXml(x)}</${wrap}>`).join("\n")
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

  return `<patient_context>
  <age_years>${p.ageYears ?? "unknown"}</age_years>
  <sex_at_birth>${escapeXml(p.sexAtBirth ?? "unknown")}</sex_at_birth>
  <chief_complaint>${escapeXml(p.chiefComplaint ?? "not provided")}</chief_complaint>
  <known_allergies>
${listBlock(p.knownAllergies, "allergy")}
  </known_allergies>
  <current_medications>
${listBlock(p.currentMedications, "medication")}
  </current_medications>
  <active_problem_list>
${listBlock(p.activeProblemList, "problem")}
  </active_problem_list>
</patient_context>

<visit_context>
  <visit_type>${escapeXml(v.type ?? "unspecified")}</visit_type>
  <visit_setting>${escapeXml(v.setting ?? "unspecified")}</visit_setting>
  <is_new_patient>${v.isNewPatient === undefined ? "unknown" : String(v.isNewPatient)}</is_new_patient>
  <visit_duration_minutes>${v.durationMinutes ?? "unknown"}</visit_duration_minutes>
</visit_context>

<soap_draft>
  <subjective>${escapeXml(soapDraft.subjective.text)}</subjective>
  <objective>${escapeXml(soapDraft.objective.text)}</objective>
  <assessment>${escapeXml(soapDraft.assessment.text)}</assessment>
  <plan>${escapeXml(soapDraft.plan.text)}</plan>
</soap_draft>

<transcript>
${segmentBlock || "  <none/>"}
</transcript>

<instructions>
Suggest ICD-10-CM and CPT codes supported by the SOAP draft and transcript
above. Follow every rule in the system prompt. Be conservative. Always
include rationale and missingDocumentation for every suggestion.
</instructions>

<output_schema>
${JSON.stringify(outputJsonSchema, null, 2)}
</output_schema>

<output_mode>json</output_mode>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Output contract — JSON Schema (embedded in prompt) and Zod mirror.
// Model emits flat confidence per suggestion; server lifts to Confidence
// object before persisting.
// ---------------------------------------------------------------------------

export const WARNING_TAG_REGEX =
  /^(Contradiction|Missing|Unclear|Conflict|Off-context|Unsupported|Overcoding|Redacted): /;

export const ICD10_CODE_REGEX = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
export const CPT_CODE_REGEX = /^\d{5}$/;

export const outputJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "vitalflow.ai.scribe.code_suggestions.v1",
  type: "object",
  additionalProperties: false,
  required: ["suggestions", "warnings"],
  properties: {
    suggestions: {
      type: "array",
      maxItems: 30,
      items: { $ref: "#/$defs/Suggestion" },
    },
    warnings: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
        maxLength: 500,
        pattern:
          "^(Contradiction|Missing|Unclear|Conflict|Off-context|Unsupported|Overcoding|Redacted): ",
      },
      maxItems: 50,
    },
  },
  $defs: {
    Suggestion: {
      type: "object",
      additionalProperties: false,
      required: [
        "type",
        "codeSystem",
        "code",
        "description",
        "rationale",
        "missingDocumentation",
        "confidence",
        "rank",
        "segmentIds",
        "source",
      ],
      properties: {
        type: { enum: ["diagnosis", "procedure"] },
        codeSystem: { enum: ["icd10-cm", "cpt"] },
        code: { type: "string", minLength: 1, maxLength: 32 },
        description: { type: "string", minLength: 1, maxLength: 512 },
        rationale: { type: "string", minLength: 20, maxLength: 800 },
        missingDocumentation: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 300 },
          maxItems: 8,
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        rank: { type: "integer", minimum: 1, maximum: 30 },
        segmentIds: {
          type: "array",
          items: { type: "string", format: "uuid" },
          maxItems: 50,
          uniqueItems: true,
        },
        source: { enum: ["transcript", "soap_only", "patient_context"] },
      },
    },
  },
} as const;

export const CodeSuggestionsModelSuggestionSchema = z
  .object({
    type: z.enum(["diagnosis", "procedure"]),
    codeSystem: z.enum(["icd10-cm", "cpt"]),
    code: z.string().min(1).max(32),
    description: z.string().min(1).max(512),
    rationale: z.string().min(20).max(800),
    missingDocumentation: z.array(z.string().min(1).max(300)).max(8).default([]),
    confidence: z.number().min(0).max(1),
    rank: z.number().int().min(1).max(30),
    segmentIds: z.array(z.string().uuid()).max(50).default([]),
    source: z.enum(["transcript", "soap_only", "patient_context"]),
  })
  .superRefine((val, ctx) => {
    const wantSystem = val.type === "diagnosis" ? "icd10-cm" : "cpt";
    if (val.codeSystem !== wantSystem) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["codeSystem"],
        message: `type=${val.type} requires codeSystem=${wantSystem}`,
      });
    }
    if (val.codeSystem === "icd10-cm" && !ICD10_CODE_REGEX.test(val.code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["code"],
        message: "ICD-10-CM code must match ^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$",
      });
    }
    if (val.codeSystem === "cpt" && !CPT_CODE_REGEX.test(val.code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["code"],
        message: "CPT code must match ^\\d{5}$",
      });
    }
  });
export type CodeSuggestionsModelSuggestion = z.infer<typeof CodeSuggestionsModelSuggestionSchema>;

export const CodeSuggestionsModelOutputSchema = z.object({
  suggestions: z.array(CodeSuggestionsModelSuggestionSchema).max(30).default([]),
  warnings: z.array(z.string().min(1).max(500).regex(WARNING_TAG_REGEX)).max(50).default([]),
});
export type CodeSuggestionsModelOutput = z.infer<typeof CodeSuggestionsModelOutputSchema>;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata = {
  id: "vitalflow.ai.scribe.code_suggestions",
  version: "1.0.0",
  createdAt: "2026-04-20",
  modelDefault: "gemini-2.0-flash",
  modelEnvVar: "AI_SCRIBE_CODES_MODEL",
  supportedOutputModes: ["json"] as const,
  notes:
    "Initial release. Model-agnostic (JSON schema embedded in user prompt). Service picks model via AI_SCRIBE_CODES_MODEL env var or per-session modelOverride.",
} as const;
