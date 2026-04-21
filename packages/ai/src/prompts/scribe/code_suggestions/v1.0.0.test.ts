import { describe, expect, it } from "vitest";

import type {
  AIScribeTranscriptSegment,
  Confidence,
  SoapDraft,
  SoapSection,
} from "@vitalflow/types";

import {
  CodeSuggestionsModelOutputSchema,
  CPT_CODE_REGEX,
  ICD10_CODE_REGEX,
  WARNING_TAG_REGEX,
  buildUserPrompt,
  metadata,
  outputJsonSchema,
  system,
} from "./v1.0.0.js";
import {
  CODE_SUGGESTIONS_PROMPT_LATEST_STABLE,
  CODE_SUGGESTIONS_PROMPT_REGISTRY,
  getCodeSuggestionsPromptModule,
  selectCodeSuggestionsPromptVersion,
} from "../../index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SEG_A = "11111111-1111-4111-8111-111111111111";
const SEG_B = "22222222-2222-4222-8222-222222222222";

function makeSegment(
  overrides: Partial<AIScribeTranscriptSegment> = {},
): AIScribeTranscriptSegment {
  return {
    id: SEG_A as AIScribeTranscriptSegment["id"],
    tenantId: "00000000-0000-0000-0000-000000000001" as AIScribeTranscriptSegment["tenantId"],
    sessionId: "00000000-0000-0000-0000-000000000002" as AIScribeTranscriptSegment["sessionId"],
    sequenceIndex: 0,
    text: "Acute sore throat × 3 days with erythematous pharynx on exam.",
    partial: false,
    createdAt: "2026-04-20T12:00:00Z",
    ...overrides,
  };
}

function makeConfidence(model_self = 0.8): Confidence {
  return { model_self, grounding: 0.8, combined: 0.8 };
}

function makeSection(text: string, segmentIds: string[] = []): SoapSection {
  return {
    text,
    segmentIds: segmentIds as SoapSection["segmentIds"],
    confidence: makeConfidence(),
  };
}

function makeSoapDraft(): SoapDraft {
  return {
    subjective: makeSection("Sore throat × 3 days. No fever. No cough.", [SEG_A]),
    objective: makeSection("Erythematous pharynx. No exudate. Tonsils 1+.", [SEG_A]),
    assessment: makeSection("Likely viral pharyngitis.", [SEG_B]),
    plan: makeSection("Supportive care. Return if worsening.", [SEG_B]),
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

describe("code_suggestions v1.0.0 system prompt", () => {
  it("declares evidence-first rule", () => {
    expect(system).toMatch(/EVIDENCE-FIRST/);
  });

  it("makes rationale mandatory", () => {
    expect(system).toMatch(/RATIONALE IS MANDATORY/);
  });

  it("requires missingDocumentation honesty", () => {
    expect(system).toMatch(/MISSING-DOCUMENTATION HONESTY/);
  });

  it("bans overcoding including E/M auto-upgrading", () => {
    expect(system).toMatch(/AVOID OVERCODING/);
    expect(system).toMatch(/E\/M level codes/);
    expect(system).toMatch(/MOST CONSERVATIVE level/);
  });

  it("enumerates the full warning tag vocabulary (8 tags)", () => {
    for (const tag of [
      "Contradiction:",
      "Missing:",
      "Unclear:",
      "Conflict:",
      "Off-context:",
      "Unsupported:",
      "Overcoding:",
      "Redacted:",
    ]) {
      expect(system).toContain(tag);
    }
  });

  it("forbids fabricating codes", () => {
    expect(system).toMatch(/NEVER FABRICATE CODES/);
  });

  it("declares refusal on weak inputs", () => {
    expect(system).toMatch(/REFUSE on weak inputs/);
    expect(system).toMatch(/non-English transcript/);
  });
});

// ---------------------------------------------------------------------------
// buildUserPrompt
// ---------------------------------------------------------------------------

describe("buildUserPrompt", () => {
  it("renders patient context with defaults when fields are absent", () => {
    const out = buildUserPrompt({
      segments: [makeSegment()],
      patientContextHints: {},
      visitContext: {},
      soapDraft: makeSoapDraft(),
    });
    expect(out).toContain("<age_years>unknown</age_years>");
    expect(out).toContain("<sex_at_birth>unknown</sex_at_birth>");
    expect(out).toContain("<chief_complaint>not provided</chief_complaint>");
    expect(out).toContain("<known_allergies>\n    <none/>\n  </known_allergies>");
    expect(out).toContain("<current_medications>\n    <none/>\n  </current_medications>");
    expect(out).toContain("<active_problem_list>\n    <none/>\n  </active_problem_list>");
    expect(out).toContain("<visit_type>unspecified</visit_type>");
    expect(out).toContain("<is_new_patient>unknown</is_new_patient>");
    expect(out).toContain("<visit_duration_minutes>unknown</visit_duration_minutes>");
  });

  it("renders active problem list when provided", () => {
    const out = buildUserPrompt({
      segments: [makeSegment()],
      patientContextHints: { activeProblemList: ["Type 2 diabetes", "Hypertension"] },
      visitContext: {},
      soapDraft: makeSoapDraft(),
    });
    expect(out).toContain("<problem>Type 2 diabetes</problem>");
    expect(out).toContain("<problem>Hypertension</problem>");
  });

  it("renders visit context fields", () => {
    const out = buildUserPrompt({
      segments: [makeSegment()],
      patientContextHints: {},
      visitContext: {
        type: "office_visit",
        setting: "outpatient",
        isNewPatient: true,
        durationMinutes: 22,
      },
      soapDraft: makeSoapDraft(),
    });
    expect(out).toContain("<visit_type>office_visit</visit_type>");
    expect(out).toContain("<visit_setting>outpatient</visit_setting>");
    expect(out).toContain("<is_new_patient>true</is_new_patient>");
    expect(out).toContain("<visit_duration_minutes>22</visit_duration_minutes>");
  });

  it("renders SOAP draft sections", () => {
    const out = buildUserPrompt({
      segments: [makeSegment()],
      patientContextHints: {},
      visitContext: {},
      soapDraft: makeSoapDraft(),
    });
    expect(out).toContain("<subjective>Sore throat × 3 days. No fever. No cough.</subjective>");
    expect(out).toContain("<assessment>Likely viral pharyngitis.</assessment>");
  });

  it("includes each segment with its uuid id verbatim", () => {
    const out = buildUserPrompt({
      segments: [
        makeSegment({ id: SEG_A as AIScribeTranscriptSegment["id"] }),
        makeSegment({
          id: SEG_B as AIScribeTranscriptSegment["id"],
          sequenceIndex: 1,
          text: "Throat culture pending.",
        }),
      ],
      patientContextHints: {},
      visitContext: {},
      soapDraft: makeSoapDraft(),
    });
    expect(out).toContain(`id="${SEG_A}"`);
    expect(out).toContain(`id="${SEG_B}"`);
    expect(out).toContain("Throat culture pending.");
  });

  it("renders <none/> for an empty segment list", () => {
    const out = buildUserPrompt({
      segments: [],
      patientContextHints: {},
      visitContext: {},
      soapDraft: makeSoapDraft(),
    });
    expect(out).toContain("<transcript>\n  <none/>\n</transcript>");
  });

  it("always embeds the output JSON schema and ends with json mode", () => {
    const out = buildUserPrompt({
      segments: [makeSegment()],
      patientContextHints: {},
      visitContext: {},
      soapDraft: makeSoapDraft(),
    });
    expect(out).toContain("<output_schema>");
    expect(out).toContain("vitalflow.ai.scribe.code_suggestions.v1");
    expect(out.trimEnd().endsWith("<output_mode>json</output_mode>")).toBe(true);
  });

  it("escapes XML-special characters", () => {
    const out = buildUserPrompt({
      segments: [makeSegment({ text: 'Says "I & you" <loud>' })],
      patientContextHints: { chiefComplaint: "R&D <pain>" },
      visitContext: { type: "q&a" },
      soapDraft: {
        ...makeSoapDraft(),
        subjective: makeSection("A & B <c>", [SEG_A]),
      },
    });
    expect(out).toContain("R&amp;D &lt;pain&gt;");
    expect(out).toContain("A &amp; B &lt;c&gt;");
    expect(out).not.toContain("<loud>");
    expect(out).not.toContain("<pain>");
  });

  it("is a pure function (same input → same output)", () => {
    const input = {
      segments: [makeSegment()],
      patientContextHints: { ageYears: 30 },
      visitContext: {},
      soapDraft: makeSoapDraft(),
    };
    expect(buildUserPrompt(input)).toBe(buildUserPrompt(input));
  });
});

// ---------------------------------------------------------------------------
// Output JSON schema + Zod mirror
// ---------------------------------------------------------------------------

describe("outputJsonSchema", () => {
  it("requires suggestions and warnings at the top level", () => {
    expect(outputJsonSchema.required).toEqual(["suggestions", "warnings"]);
    expect(outputJsonSchema.additionalProperties).toBe(false);
  });

  it("declares all required Suggestion fields", () => {
    expect(outputJsonSchema.$defs.Suggestion.required).toEqual([
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
    ]);
  });

  it("constrains warnings to the tag vocabulary", () => {
    expect(outputJsonSchema.properties.warnings.items.pattern).toBe(WARNING_TAG_REGEX.source);
  });
});

const VALID_SUGGESTION = {
  type: "diagnosis" as const,
  codeSystem: "icd10-cm" as const,
  code: "J02.9",
  description: "Acute pharyngitis, unspecified",
  rationale:
    "Clinician documented acute sore throat × 3 days with erythematous pharynx on exam; no tonsillar exudate, no fever — supports J02.9.",
  missingDocumentation: ["Streptococcal test result"],
  confidence: 0.82,
  rank: 1,
  segmentIds: [SEG_A],
  source: "transcript" as const,
};

const VALID_OUTPUT = {
  suggestions: [VALID_SUGGESTION],
  warnings: ["Unsupported: rapid strep test mentioned but no result documented"],
};

describe("CodeSuggestionsModelOutputSchema", () => {
  it("parses a valid model output", () => {
    expect(() => CodeSuggestionsModelOutputSchema.parse(VALID_OUTPUT)).not.toThrow();
  });

  it("defaults suggestions and warnings to empty arrays when absent", () => {
    const parsed = CodeSuggestionsModelOutputSchema.parse({});
    expect(parsed.suggestions).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it("rejects a diagnosis with codeSystem=cpt", () => {
    const bad = {
      ...VALID_OUTPUT,
      suggestions: [{ ...VALID_SUGGESTION, codeSystem: "cpt" as const, code: "99213" }],
    };
    expect(() => CodeSuggestionsModelOutputSchema.parse(bad)).toThrow(/codeSystem/);
  });

  it("rejects a procedure with codeSystem=icd10-cm", () => {
    const bad = {
      ...VALID_OUTPUT,
      suggestions: [
        {
          ...VALID_SUGGESTION,
          type: "procedure" as const,
          codeSystem: "icd10-cm" as const,
          code: "J02.9",
        },
      ],
    };
    expect(() => CodeSuggestionsModelOutputSchema.parse(bad)).toThrow(/codeSystem/);
  });

  it("rejects a malformed ICD-10-CM code", () => {
    const bad = {
      ...VALID_OUTPUT,
      suggestions: [{ ...VALID_SUGGESTION, code: "BAD_CODE" }],
    };
    expect(() => CodeSuggestionsModelOutputSchema.parse(bad)).toThrow(/ICD-10/);
  });

  it("rejects a malformed CPT code", () => {
    const bad = {
      ...VALID_OUTPUT,
      suggestions: [
        {
          type: "procedure" as const,
          codeSystem: "cpt" as const,
          code: "123",
          description: "x",
          rationale:
            "Visit documented as office visit with minimal MDM; 99211 is the conservative floor for an established-patient nurse-led encounter.",
          missingDocumentation: ["Provider time", "MDM level"],
          confidence: 0.5,
          rank: 1,
          segmentIds: [SEG_A],
          source: "transcript" as const,
        },
      ],
    };
    expect(() => CodeSuggestionsModelOutputSchema.parse(bad)).toThrow(/CPT/);
  });

  it("rejects a rationale shorter than 20 chars", () => {
    const bad = {
      ...VALID_OUTPUT,
      suggestions: [{ ...VALID_SUGGESTION, rationale: "too short" }],
    };
    expect(() => CodeSuggestionsModelOutputSchema.parse(bad)).toThrow();
  });

  it("rejects confidence outside [0, 1]", () => {
    const bad = {
      ...VALID_OUTPUT,
      suggestions: [{ ...VALID_SUGGESTION, confidence: 1.5 }],
    };
    expect(() => CodeSuggestionsModelOutputSchema.parse(bad)).toThrow();
  });

  it("rejects a non-uuid segmentId", () => {
    const bad = {
      ...VALID_OUTPUT,
      suggestions: [{ ...VALID_SUGGESTION, segmentIds: ["not-a-uuid"] }],
    };
    expect(() => CodeSuggestionsModelOutputSchema.parse(bad)).toThrow();
  });

  it("rejects a warning without a recognized tag prefix", () => {
    const bad = { ...VALID_OUTPUT, warnings: ["this has no tag"] };
    expect(() => CodeSuggestionsModelOutputSchema.parse(bad)).toThrow();
  });

  it("accepts an empty suggestions list with a Missing warning (refusal case)", () => {
    const refusal = {
      suggestions: [],
      warnings: ["Missing: insufficient documentation for coding"],
    };
    expect(() => CodeSuggestionsModelOutputSchema.parse(refusal)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Code regexes
// ---------------------------------------------------------------------------

describe("code regexes", () => {
  it("ICD-10-CM regex accepts valid codes", () => {
    for (const code of ["A00", "J02.9", "M79.604", "Z00.00", "S72.001A"]) {
      expect(ICD10_CODE_REGEX.test(code)).toBe(true);
    }
  });
  it("ICD-10-CM regex rejects invalid codes", () => {
    for (const code of ["", "a02.9", "J2", "99213", "J02.", "J02.12345"]) {
      expect(ICD10_CODE_REGEX.test(code)).toBe(false);
    }
  });
  it("CPT regex accepts 5-digit codes only", () => {
    expect(CPT_CODE_REGEX.test("99213")).toBe(true);
    expect(CPT_CODE_REGEX.test("99202")).toBe(true);
    expect(CPT_CODE_REGEX.test("1234")).toBe(false);
    expect(CPT_CODE_REGEX.test("123456")).toBe(false);
    expect(CPT_CODE_REGEX.test("9921A")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("metadata", () => {
  it("declares id, version, and Gemini Flash default model", () => {
    expect(metadata.id).toBe("vitalflow.ai.scribe.code_suggestions");
    expect(metadata.version).toBe("1.0.0");
    expect(metadata.modelDefault).toBe("gemini-2.0-flash");
    expect(metadata.modelEnvVar).toBe("AI_SCRIBE_CODES_MODEL");
  });
  it("supports only json output mode", () => {
    expect(metadata.supportedOutputModes).toEqual(["json"]);
  });
});

// ---------------------------------------------------------------------------
// Registry + selector
// ---------------------------------------------------------------------------

describe("code-suggestions prompt registry", () => {
  it("registers v1.0.0", () => {
    expect(Object.keys(CODE_SUGGESTIONS_PROMPT_REGISTRY)).toContain("1.0.0");
  });

  it("LATEST_STABLE points at a registered version", () => {
    expect(CODE_SUGGESTIONS_PROMPT_REGISTRY[CODE_SUGGESTIONS_PROMPT_LATEST_STABLE]).toBeDefined();
  });

  it("getCodeSuggestionsPromptModule returns the module", () => {
    const mod = getCodeSuggestionsPromptModule("1.0.0");
    expect(mod.metadata.version).toBe("1.0.0");
    expect(typeof mod.system).toBe("string");
    expect(typeof mod.buildUserPrompt).toBe("function");
  });
});

describe("selectCodeSuggestionsPromptVersion", () => {
  it("prefers an explicit override", () => {
    expect(selectCodeSuggestionsPromptVersion({ override: "1.0.0", envDefault: null })).toBe(
      "1.0.0",
    );
  });
  it("falls back to env default when no override", () => {
    expect(selectCodeSuggestionsPromptVersion({ override: null, envDefault: "1.0.0" })).toBe(
      "1.0.0",
    );
  });
  it("falls back to LATEST_STABLE when neither is provided", () => {
    expect(selectCodeSuggestionsPromptVersion({ override: null, envDefault: null })).toBe(
      CODE_SUGGESTIONS_PROMPT_LATEST_STABLE,
    );
  });
  it("throws on an unknown version", () => {
    expect(() =>
      selectCodeSuggestionsPromptVersion({ override: "9.9.9", envDefault: null }),
    ).toThrow(/Unknown code-suggestions prompt version/);
  });
});
