import { describe, expect, it } from "vitest";

import type { AIScribeTranscriptSegment } from "@vitalflow/types";

import {
  buildUserPrompt,
  metadata,
  outputJsonSchema,
  SoapModelOutputSchema,
  system,
  WARNING_TAG_REGEX,
} from "./v1.0.0.js";
import {
  SOAP_PROMPT_LATEST_STABLE,
  SOAP_PROMPT_REGISTRY,
  getSoapPromptModule,
  selectSoapPromptVersion,
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
    text: "Patient reports sore throat for 3 days.",
    partial: false,
    createdAt: "2026-04-20T12:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// System prompt — content smoke tests (catches accidental rule deletion)
// ---------------------------------------------------------------------------

describe("soap v1.0.0 system prompt", () => {
  it("declares the no-invention rule", () => {
    expect(system).toMatch(/DO NOT invent/);
    expect(system).toMatch(/traceable/i);
  });

  it("declares the trace-by-segmentId rule", () => {
    expect(system).toMatch(/segmentIds/);
    expect(system).toMatch(/Never fabricate or alter ids/);
  });

  it("enumerates the full warning tag vocabulary", () => {
    for (const tag of [
      "Contradiction:",
      "Missing:",
      "Unclear:",
      "Conflict:",
      "Off-context:",
      "Judgment:",
      "Redacted:",
    ]) {
      expect(system).toContain(tag);
    }
  });

  it("specifies both output modes", () => {
    expect(system).toContain("<output_mode>json</output_mode>");
    expect(system).toContain("<output_mode>markdown</output_mode>");
  });

  it("forbids auto-prescription in the Plan section", () => {
    expect(system).toMatch(/Never output treatment recommendations that were not discussed/);
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
      outputMode: "json",
    });
    expect(out).toContain("<age_years>unknown</age_years>");
    expect(out).toContain("<sex_at_birth>unknown</sex_at_birth>");
    expect(out).toContain("<chief_complaint>not provided</chief_complaint>");
    expect(out).toContain("<known_allergies>\n    <none/>\n  </known_allergies>");
    expect(out).toContain("<current_medications>\n    <none/>\n  </current_medications>");
  });

  it("renders allergies and medications when present", () => {
    const out = buildUserPrompt({
      segments: [makeSegment()],
      patientContextHints: {
        ageYears: 42,
        sexAtBirth: "female",
        chiefComplaint: "sore throat",
        knownAllergies: ["penicillin", "peanuts"],
        currentMedications: ["metformin 500mg BID"],
      },
      outputMode: "json",
    });
    expect(out).toContain("<age_years>42</age_years>");
    expect(out).toContain("<chief_complaint>sore throat</chief_complaint>");
    expect(out).toContain("<allergy>penicillin</allergy>");
    expect(out).toContain("<allergy>peanuts</allergy>");
    expect(out).toContain("<medication>metformin 500mg BID</medication>");
  });

  it("includes each segment with its uuid id verbatim", () => {
    const out = buildUserPrompt({
      segments: [
        makeSegment({ id: SEG_A as AIScribeTranscriptSegment["id"], sequenceIndex: 0 }),
        makeSegment({
          id: SEG_B as AIScribeTranscriptSegment["id"],
          sequenceIndex: 1,
          text: "No fever, no cough.",
        }),
      ],
      patientContextHints: {},
      outputMode: "json",
    });
    expect(out).toContain(`id="${SEG_A}"`);
    expect(out).toContain(`id="${SEG_B}"`);
    expect(out).toContain("Patient reports sore throat");
    expect(out).toContain("No fever, no cough.");
  });

  it("includes timestamp and speaker attributes only when provided", () => {
    const out = buildUserPrompt({
      segments: [
        makeSegment({ startMs: 0, endMs: 8400, speaker: "clinician" }),
        makeSegment({ id: SEG_B as AIScribeTranscriptSegment["id"], sequenceIndex: 1 }),
      ],
      patientContextHints: {},
      outputMode: "json",
    });
    expect(out).toMatch(/start_ms="0"\s+end_ms="8400"/);
    expect(out).toContain('speaker="clinician"');
    // Second segment should not carry timestamps or speaker
    const secondSeg = out.split(`id="${SEG_B}"`)[1]!.split("</segment>")[0]!;
    expect(secondSeg).not.toContain("start_ms");
    expect(secondSeg).not.toContain("speaker=");
  });

  it("embeds the output JSON schema in json mode only", () => {
    const jsonOut = buildUserPrompt({
      segments: [makeSegment()],
      patientContextHints: {},
      outputMode: "json",
    });
    expect(jsonOut).toContain("<output_schema>");
    expect(jsonOut).toContain("vitalflow.ai.scribe.soap_draft.v1");

    const mdOut = buildUserPrompt({
      segments: [makeSegment()],
      patientContextHints: {},
      outputMode: "markdown",
    });
    expect(mdOut).not.toContain("<output_schema>");
  });

  it("escapes XML-special characters in user-provided values", () => {
    const out = buildUserPrompt({
      segments: [makeSegment({ text: 'Patient said "hi & bye" <loudly>.' })],
      patientContextHints: { chiefComplaint: "R&D <symptom>" },
      outputMode: "json",
    });
    expect(out).toContain("R&amp;D &lt;symptom&gt;");
    expect(out).toContain("&quot;hi &amp; bye&quot; &lt;loudly&gt;.");
    // Raw unescaped angle brackets from user content must not appear
    expect(out).not.toContain("<loudly>");
    expect(out).not.toContain("<symptom>");
  });

  it("terminates with the output_mode tag", () => {
    const out = buildUserPrompt({
      segments: [makeSegment()],
      patientContextHints: {},
      outputMode: "markdown",
    });
    expect(out.trimEnd().endsWith("<output_mode>markdown</output_mode>")).toBe(true);
  });

  it("is a pure function (same input → same output)", () => {
    const input = {
      segments: [makeSegment()],
      patientContextHints: { ageYears: 30 },
      outputMode: "json" as const,
    };
    expect(buildUserPrompt(input)).toBe(buildUserPrompt(input));
  });
});

// ---------------------------------------------------------------------------
// Output JSON schema + Zod mirror
// ---------------------------------------------------------------------------

describe("outputJsonSchema", () => {
  it("has the expected top-level required fields", () => {
    expect(outputJsonSchema.required).toEqual([
      "subjective",
      "objective",
      "assessment",
      "plan",
      "warnings",
    ]);
    expect(outputJsonSchema.additionalProperties).toBe(false);
  });

  it("declares a Section definition with text, segmentIds, confidence", () => {
    const section = outputJsonSchema.$defs.Section;
    expect(section.required).toEqual(["text", "segmentIds", "confidence"]);
    expect(section.additionalProperties).toBe(false);
    expect(section.properties.confidence.minimum).toBe(0);
    expect(section.properties.confidence.maximum).toBe(1);
  });

  it("constrains warnings to the tag vocabulary", () => {
    const pattern = outputJsonSchema.properties.warnings.items.pattern;
    expect(pattern).toBe(WARNING_TAG_REGEX.source);
  });
});

const VALID_MODEL_OUTPUT = {
  subjective: {
    text: "Sore throat × 3 days. No fever.",
    segmentIds: [SEG_A],
    confidence: 0.85,
  },
  objective: {
    text: "Not documented.",
    segmentIds: [],
    confidence: 0.3,
  },
  assessment: {
    text: "Likely viral pharyngitis.",
    segmentIds: [SEG_B],
    confidence: 0.72,
  },
  plan: {
    text: "Supportive care. Return if worsening.",
    segmentIds: [SEG_B],
    confidence: 0.68,
  },
  warnings: ["Unclear: patient's voice was muffled around vitals discussion"],
};

describe("SoapModelOutputSchema", () => {
  it("parses a valid model output", () => {
    expect(() => SoapModelOutputSchema.parse(VALID_MODEL_OUTPUT)).not.toThrow();
  });

  it("rejects output missing a required section", () => {
    const { subjective: _, ...missing } = VALID_MODEL_OUTPUT;
    expect(() => SoapModelOutputSchema.parse(missing)).toThrow();
  });

  it("defaults warnings[] to empty when absent", () => {
    const { warnings: _, ...withoutWarnings } = VALID_MODEL_OUTPUT;
    const parsed = SoapModelOutputSchema.parse(withoutWarnings);
    expect(parsed.warnings).toEqual([]);
  });

  it("rejects a warning without a recognized tag prefix", () => {
    const bad = { ...VALID_MODEL_OUTPUT, warnings: ["this is a raw comment"] };
    expect(() => SoapModelOutputSchema.parse(bad)).toThrow();
  });

  it("rejects confidence outside [0, 1]", () => {
    const bad = {
      ...VALID_MODEL_OUTPUT,
      subjective: { ...VALID_MODEL_OUTPUT.subjective, confidence: 1.2 },
    };
    expect(() => SoapModelOutputSchema.parse(bad)).toThrow();
  });

  it("rejects a non-uuid segmentId", () => {
    const bad = {
      ...VALID_MODEL_OUTPUT,
      plan: { ...VALID_MODEL_OUTPUT.plan, segmentIds: ["not-a-uuid"] },
    };
    expect(() => SoapModelOutputSchema.parse(bad)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe("metadata", () => {
  it("declares id, version, modelDefault", () => {
    expect(metadata.id).toBe("vitalflow.ai.scribe.soap");
    expect(metadata.version).toBe("1.0.0");
    expect(metadata.modelDefault).toBe("claude-opus-4-7");
  });

  it("lists both output modes as supported", () => {
    expect(metadata.supportedOutputModes).toEqual(["json", "markdown"]);
  });
});

// ---------------------------------------------------------------------------
// Registry + selector
// ---------------------------------------------------------------------------

describe("SOAP prompt registry", () => {
  it("registers v1.0.0", () => {
    expect(Object.keys(SOAP_PROMPT_REGISTRY)).toContain("1.0.0");
  });

  it("LATEST_STABLE points at a registered version", () => {
    expect(SOAP_PROMPT_REGISTRY[SOAP_PROMPT_LATEST_STABLE]).toBeDefined();
  });

  it("getSoapPromptModule returns the module", () => {
    const mod = getSoapPromptModule("1.0.0");
    expect(mod.metadata.version).toBe("1.0.0");
    expect(typeof mod.system).toBe("string");
    expect(typeof mod.buildUserPrompt).toBe("function");
  });
});

describe("selectSoapPromptVersion", () => {
  it("prefers an explicit override", () => {
    expect(selectSoapPromptVersion({ override: "1.0.0", envDefault: null })).toBe("1.0.0");
  });

  it("falls back to env default when no override is provided", () => {
    expect(selectSoapPromptVersion({ override: null, envDefault: "1.0.0" })).toBe("1.0.0");
  });

  it("falls back to LATEST_STABLE when neither override nor env is provided", () => {
    expect(selectSoapPromptVersion({ override: null, envDefault: null })).toBe(
      SOAP_PROMPT_LATEST_STABLE,
    );
  });

  it("throws on an unknown version", () => {
    expect(() => selectSoapPromptVersion({ override: "9.9.9", envDefault: null })).toThrow(
      /Unknown SOAP prompt version/,
    );
  });
});
