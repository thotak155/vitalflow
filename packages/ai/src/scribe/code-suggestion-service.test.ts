import { describe, expect, it, vi } from "vitest";

import type {
  AICompletionRequest,
  AIScribeSessionId,
  AIScribeTranscriptSegment,
  Confidence,
  SoapDraft,
  SoapSection,
  TenantId,
  UserId,
} from "@vitalflow/types";

import type { AICompletionResult, AIProvider, CompletionChunk } from "../providers/index.js";

import type { ScribeServiceContext } from "./services.js";
import {
  CodeSuggestionServiceImpl,
  CodeSuggestionGenerationError,
  computeCostMicrosUsd,
  computeGrounding,
  computeSoapSupport,
  computeSpecificity,
  computeTranscriptSupport,
  harmonicMean,
  liftSuggestion,
  resolveModel,
  sanitizeSegmentIds,
  tryParseModelOutput,
} from "./code-suggestion-service.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT = "00000000-0000-0000-0000-000000000001" as TenantId;
const USER = "00000000-0000-0000-0000-000000000002" as UserId;
const SESSION = "00000000-0000-0000-0000-000000000003" as AIScribeSessionId;
const REQ = "00000000-0000-0000-0000-000000000004";
const SEG_A = "11111111-1111-4111-8111-111111111111";
const SEG_B = "22222222-2222-4222-8222-222222222222";
const SEG_C = "33333333-3333-4333-8333-333333333333";

const CTX: ScribeServiceContext = { tenantId: TENANT, userId: USER };

function seg(overrides: Partial<AIScribeTranscriptSegment> = {}): AIScribeTranscriptSegment {
  return {
    id: SEG_A as AIScribeTranscriptSegment["id"],
    tenantId: TENANT,
    sessionId: SESSION,
    sequenceIndex: 0,
    text: "Patient reports sore throat for three days with erythematous pharynx on exam",
    partial: false,
    createdAt: "2026-04-20T12:00:00Z",
    ...overrides,
  };
}

function conf(v = 0.8): Confidence {
  return { model_self: v, grounding: v, combined: v };
}

function section(text: string, segmentIds: string[] = []): SoapSection {
  return {
    text,
    segmentIds: segmentIds as SoapSection["segmentIds"],
    confidence: conf(),
  };
}

function draft(): SoapDraft {
  return {
    subjective: section("Sore throat × 3 days with erythematous pharynx no fever", [SEG_A]),
    objective: section("Pharynx erythematous without exudate tonsils 1+", [SEG_A]),
    assessment: section("Acute pharyngitis likely viral", [SEG_B]),
    plan: section("Supportive care return if worsening", [SEG_B]),
    warnings: [],
  };
}

const CONTEXT_HINTS = {
  activeProblemList: ["Hypertension"],
  currentMedications: ["Lisinopril 10mg"],
  knownAllergies: ["Penicillin"],
  chiefComplaint: "sore throat",
};

const VISIT_CONTEXT = {
  type: "office_visit",
  setting: "outpatient",
  isNewPatient: false,
  durationMinutes: 15,
};

function suggestion(overrides: Partial<unknown> = {}) {
  return {
    type: "diagnosis" as const,
    codeSystem: "icd10-cm" as const,
    code: "J02.9",
    description: "Acute pharyngitis unspecified",
    rationale:
      "Clinician documented acute sore throat × 3 days with erythematous pharynx; no exudate, no fever — supports J02.9.",
    missingDocumentation: [],
    confidence: 0.85,
    rank: 1,
    segmentIds: [SEG_A],
    source: "transcript" as const,
    ...(overrides as Record<string, unknown>),
  };
}

function validOutput(sugOverrides: Partial<unknown> = {}) {
  return {
    suggestions: [suggestion(sugOverrides)],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

interface MockResponse {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

function makeMockProvider(responses: readonly MockResponse[]) {
  const calls: { request: AICompletionRequest }[] = [];
  let idx = 0;
  const provider: AIProvider = {
    name: "anthropic",
    supports: ["claude-opus-4-7", "gemini-2.0-flash"],
    async complete(request: AICompletionRequest): Promise<AICompletionResult> {
      calls.push({ request });
      const r = responses[idx];
      idx += 1;
      if (!r) throw new Error(`MockProvider exhausted — unexpected call #${idx}`);
      return {
        content: r.content,
        messages: [...request.messages, { role: "assistant", content: r.content }],
        usage: {
          inputTokens: r.inputTokens ?? 100,
          outputTokens: r.outputTokens ?? 200,
        },
        latencyMs: r.latencyMs ?? 500,
      };
    },
    // eslint-disable-next-line require-yield
    async *stream(): AsyncIterable<CompletionChunk> {
      throw new Error("stream not used in tests");
    },
  };
  return { provider, calls };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("CodeSuggestionServiceImpl.suggest — happy path", () => {
  it("returns codes with richer Confidence and warnings", async () => {
    const { provider } = makeMockProvider([{ content: JSON.stringify(validOutput()) }]);
    const svc = new CodeSuggestionServiceImpl({ provider });
    const result = await svc.suggest(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      draft: draft(),
      patientContextHints: CONTEXT_HINTS,
      visitContext: VISIT_CONTEXT,
    });

    expect(result.codes).toHaveLength(1);
    const code = result.codes[0]!;
    expect(code.code).toBe("J02.9");
    expect(code.rationale).toMatch(/supports J02\.9/);
    expect(code.confidence.model_self).toBe(0.85);
    expect(code.confidence.grounding).toBeGreaterThan(0);
    expect(code.confidence.combined).toBeGreaterThan(0);
    expect(code.acceptedAt).toBeNull();
    expect(code.rejectedAt).toBeNull();
  });

  it("surfaces promptId + promptVersion", async () => {
    const { provider } = makeMockProvider([{ content: JSON.stringify(validOutput()) }]);
    const svc = new CodeSuggestionServiceImpl({ provider });
    const result = await svc.suggest(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      draft: draft(),
      patientContextHints: CONTEXT_HINTS,
      visitContext: VISIT_CONTEXT,
    });
    expect(result.promptId).toBe("vitalflow.ai.scribe.code_suggestions");
    expect(result.promptVersion).toBe("1.0.0");
  });

  it("calls the provider with gemini-2.0-flash by default and low temperature", async () => {
    const { provider, calls } = makeMockProvider([{ content: JSON.stringify(validOutput()) }]);
    const svc = new CodeSuggestionServiceImpl({ provider });
    await svc.suggest(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      draft: draft(),
      patientContextHints: CONTEXT_HINTS,
      visitContext: VISIT_CONTEXT,
    });
    expect(calls[0]!.request.model).toBe("gemini-2.0-flash");
    expect(calls[0]!.request.temperature).toBe(0.1);
  });

  it("honors envDefaultModel when no override is set", async () => {
    const { provider, calls } = makeMockProvider([{ content: JSON.stringify(validOutput()) }]);
    const svc = new CodeSuggestionServiceImpl({
      provider,
      envDefaultModel: "claude-haiku-4-5",
    });
    await svc.suggest(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      draft: draft(),
      patientContextHints: CONTEXT_HINTS,
      visitContext: VISIT_CONTEXT,
    });
    expect(calls[0]!.request.model).toBe("claude-haiku-4-5");
  });

  it("params.modelOverride wins over envDefaultModel", async () => {
    const { provider, calls } = makeMockProvider([{ content: JSON.stringify(validOutput()) }]);
    const svc = new CodeSuggestionServiceImpl({
      provider,
      envDefaultModel: "claude-haiku-4-5",
    });
    await svc.suggest(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      draft: draft(),
      patientContextHints: CONTEXT_HINTS,
      visitContext: VISIT_CONTEXT,
      modelOverride: "claude-sonnet-4-6",
    });
    expect(calls[0]!.request.model).toBe("claude-sonnet-4-6");
  });
});

// ---------------------------------------------------------------------------
// Repair flow
// ---------------------------------------------------------------------------

describe("CodeSuggestionServiceImpl.suggest — repair flow", () => {
  it("retries once on invalid JSON and succeeds", async () => {
    const { provider, calls } = makeMockProvider([
      { content: "broken" },
      { content: JSON.stringify(validOutput()) },
    ]);
    const svc = new CodeSuggestionServiceImpl({ provider });
    const result = await svc.suggest(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      draft: draft(),
      patientContextHints: CONTEXT_HINTS,
      visitContext: VISIT_CONTEXT,
    });
    expect(calls).toHaveLength(2);
    expect(result.codes).toHaveLength(1);
    const secondMsgs = calls[1]!.request.messages;
    expect(secondMsgs[2]!.role).toBe("assistant");
    expect(secondMsgs[3]!.content).toMatch(/was not valid JSON/i);
  });

  it("throws CodeSuggestionGenerationError on double failure", async () => {
    const { provider } = makeMockProvider([{ content: "broken 1" }, { content: "broken 2" }]);
    const svc = new CodeSuggestionServiceImpl({ provider });
    await expect(
      svc.suggest(CTX, {
        sessionId: SESSION,
        aiRequestId: REQ,
        segments: [seg()],
        draft: draft(),
        patientContextHints: CONTEXT_HINTS,
        visitContext: VISIT_CONTEXT,
      }),
    ).rejects.toMatchObject({
      name: "CodeSuggestionGenerationError",
      rawContent: "broken 2",
    });
  });
});

// ---------------------------------------------------------------------------
// Refusal
// ---------------------------------------------------------------------------

describe("CodeSuggestionServiceImpl.suggest — refusal", () => {
  it("short-circuits with no model call when transcript AND draft are empty", async () => {
    const complete = vi.fn();
    const provider: AIProvider = {
      name: "anthropic",
      supports: ["claude-opus-4-7"],
      complete,
      // eslint-disable-next-line require-yield
      async *stream(): AsyncIterable<CompletionChunk> {
        throw new Error("unused");
      },
    };
    const svc = new CodeSuggestionServiceImpl({ provider });
    const emptyDraft: SoapDraft = {
      subjective: section("Not documented."),
      objective: section("Not documented."),
      assessment: section("Not documented."),
      plan: section("Not documented."),
      warnings: [],
    };
    const result = await svc.suggest(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [],
      draft: emptyDraft,
      patientContextHints: {},
      visitContext: {},
    });
    expect(complete).not.toHaveBeenCalled();
    expect(result.codes).toEqual([]);
    expect(result.warnings[0]).toMatch(/^Missing: insufficient documentation/);
    expect(result.tokensIn).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Hallucinated segment IDs
// ---------------------------------------------------------------------------

describe("CodeSuggestionServiceImpl.suggest — segmentId integrity", () => {
  it("drops foreign segment ids and appends a per-code Off-context warning", async () => {
    const output = validOutput({ segmentIds: [SEG_A, SEG_C] });
    const { provider } = makeMockProvider([{ content: JSON.stringify(output) }]);
    const svc = new CodeSuggestionServiceImpl({ provider });
    const result = await svc.suggest(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      draft: draft(),
      patientContextHints: CONTEXT_HINTS,
      visitContext: VISIT_CONTEXT,
    });
    expect(result.codes[0]!.segmentIds).toEqual([SEG_A]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Off-context: 1 hallucinated.* code J02\.9/)]),
    );
  });
});

// ---------------------------------------------------------------------------
// E/M confidence cap
// ---------------------------------------------------------------------------

describe("CodeSuggestionServiceImpl.suggest — E/M confidence cap", () => {
  it("caps model_self at 0.7 for E/M office codes", async () => {
    const emOutput = {
      suggestions: [
        suggestion({
          type: "procedure" as const,
          codeSystem: "cpt" as const,
          code: "99213",
          description: "Office visit established patient level 3",
          rationale:
            "Established patient office visit with documented low MDM; 99213 is the conservative level.",
          confidence: 0.9,
          segmentIds: [],
          source: "soap_only" as const,
        }),
      ],
      warnings: [],
    };
    const { provider } = makeMockProvider([{ content: JSON.stringify(emOutput) }]);
    const svc = new CodeSuggestionServiceImpl({ provider });
    const result = await svc.suggest(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      draft: draft(),
      patientContextHints: CONTEXT_HINTS,
      visitContext: VISIT_CONTEXT,
    });
    expect(result.codes[0]!.confidence.model_self).toBe(0.7);
  });

  it("does NOT cap non-E/M CPT codes", async () => {
    const procOutput = {
      suggestions: [
        suggestion({
          type: "procedure" as const,
          codeSystem: "cpt" as const,
          code: "87430",
          description: "Infectious agent antigen detection strep",
          rationale: "Rapid strep test documented as performed per clinician notes.",
          confidence: 0.85,
          segmentIds: [],
          source: "soap_only" as const,
        }),
      ],
      warnings: [],
    };
    const { provider } = makeMockProvider([{ content: JSON.stringify(procOutput) }]);
    const svc = new CodeSuggestionServiceImpl({ provider });
    const result = await svc.suggest(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      draft: draft(),
      patientContextHints: CONTEXT_HINTS,
      visitContext: VISIT_CONTEXT,
    });
    expect(result.codes[0]!.confidence.model_self).toBe(0.85);
  });
});

// ---------------------------------------------------------------------------
// Pure grounding helpers
// ---------------------------------------------------------------------------

describe("computeTranscriptSupport", () => {
  const segments = [
    seg({
      id: SEG_A as AIScribeTranscriptSegment["id"],
      text: "acute sore throat pharynx erythema",
    }),
    seg({
      id: SEG_B as AIScribeTranscriptSegment["id"],
      sequenceIndex: 1,
      text: "no fever no cough",
    }),
  ];

  it("returns 1 for non-transcript source with no citations", () => {
    const s = suggestion({ source: "soap_only", segmentIds: [] });
    expect(computeTranscriptSupport(s as never, segments)).toBe(1);
  });
  it("returns 0 for transcript source with no citations", () => {
    const s = suggestion({ source: "transcript", segmentIds: [] });
    expect(computeTranscriptSupport(s as never, segments)).toBe(0);
  });
  it("returns fraction of cited segments that contain description tokens", () => {
    const s = suggestion({
      description: "acute pharyngitis",
      source: "transcript",
      segmentIds: [SEG_A, SEG_B],
    });
    // SEG_A contains "pharynx" (no direct match with "acute pharyngitis"), but
    // "acute" matches SEG_A text. SEG_B contains no desc tokens.
    // desc tokens: acute, pharyngitis. SEG_A has "acute". SEG_B has neither.
    const result = computeTranscriptSupport(s as never, segments);
    expect(result).toBeCloseTo(0.5, 5);
  });
});

describe("computeSoapSupport", () => {
  const d = draft();

  it("returns 0 for empty rationale", () => {
    const s = suggestion({ rationale: "" });
    expect(computeSoapSupport(s as never, d, CONTEXT_HINTS)).toBe(0);
  });
  it("matches rationale against SOAP text for transcript source", () => {
    const s = suggestion({
      source: "transcript",
      rationale: "acute pharyngitis documented with erythematous pharynx",
    });
    const score = computeSoapSupport(s as never, d, CONTEXT_HINTS);
    expect(score).toBeGreaterThan(0.5);
  });
  it("matches rationale against context for patient_context source", () => {
    const s = suggestion({
      source: "patient_context",
      rationale: "Hypertension on lisinopril carried forward as active problem",
    });
    const score = computeSoapSupport(s as never, d, CONTEXT_HINTS);
    expect(score).toBeGreaterThan(0);
  });
});

describe("computeSpecificity", () => {
  it("returns 1 for zero missing items", () => {
    expect(computeSpecificity(0)).toBe(1);
  });
  it("penalizes 0.15 per missing item", () => {
    expect(computeSpecificity(1)).toBeCloseTo(0.85, 5);
    expect(computeSpecificity(2)).toBeCloseTo(0.7, 5);
  });
  it("floors at 0.4", () => {
    expect(computeSpecificity(5)).toBe(0.4);
    expect(computeSpecificity(20)).toBe(0.4);
  });
});

describe("computeGrounding", () => {
  it("is a weighted combination of transcript, soap, specificity", () => {
    const s = suggestion({
      description: "acute pharyngitis",
      source: "transcript",
      segmentIds: [SEG_A],
      rationale: "acute pharyngitis erythematous pharynx documented",
      missingDocumentation: [],
    });
    const segments = [
      seg({
        id: SEG_A as AIScribeTranscriptSegment["id"],
        text: "acute pharyngitis erythematous pharynx",
      }),
    ];
    const g = computeGrounding(s as never, draft(), segments, CONTEXT_HINTS);
    // S_transcript=1 (description tokens in cited seg), S_soap>0, S_specificity=1
    // grounding = 0.5*1 + 0.3*S_soap + 0.2*1 >= 0.7
    expect(g).toBeGreaterThanOrEqual(0.7);
    expect(g).toBeLessThanOrEqual(1);
  });
});

describe("harmonicMean", () => {
  it("returns 0 when either input is 0", () => {
    expect(harmonicMean(0, 0.9)).toBe(0);
    expect(harmonicMean(0.9, 0)).toBe(0);
  });
  it("computes standard harmonic mean", () => {
    expect(harmonicMean(0.5, 0.5)).toBe(0.5);
  });
});

describe("resolveModel", () => {
  it("defaults to gemini-2.0-flash", () => {
    expect(resolveModel()).toBe("gemini-2.0-flash");
  });
  it("accepts a valid AIModel value", () => {
    expect(resolveModel("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });
  it("falls back to default on unknown value", () => {
    expect(resolveModel("whatever")).toBe("gemini-2.0-flash");
  });
});

describe("computeCostMicrosUsd", () => {
  it("computes gemini-2.0-flash cost cheaply", () => {
    // $0.075/MTok input, $0.3/MTok output
    // 1_000_000 input tokens = $0.075 = 75_000 microUSD
    expect(computeCostMicrosUsd("gemini-2.0-flash", 1_000_000, 0)).toBe(75_000);
    expect(computeCostMicrosUsd("gemini-2.0-flash", 0, 1_000_000)).toBe(300_000);
  });
});

// ---------------------------------------------------------------------------
// liftSuggestion + sanitizeSegmentIds + tryParseModelOutput
// ---------------------------------------------------------------------------

describe("liftSuggestion", () => {
  it("applies E/M cap and lifts confidence to richer shape", () => {
    const s = suggestion({
      type: "procedure" as const,
      codeSystem: "cpt" as const,
      code: "99214",
      description: "Office visit level 4",
      rationale: "Documented moderate MDM supports 99214 over 99213 level.",
      confidence: 0.95,
      source: "soap_only" as const,
      segmentIds: [],
    });
    const row = liftSuggestion(s as never, draft(), [seg()], CONTEXT_HINTS);
    expect(row.confidence.model_self).toBe(0.7); // capped
    expect(row.confidence).toHaveProperty("grounding");
    expect(row.confidence).toHaveProperty("combined");
    expect(row.acceptedAt).toBeNull();
  });
});

describe("sanitizeSegmentIds", () => {
  it("keeps valid, drops foreign, emits one warning per affected code", () => {
    const output = validOutput({ segmentIds: [SEG_A, SEG_C] });
    const { sanitized, hallucinatedWarnings } = sanitizeSegmentIds(output, [seg()]);
    expect(sanitized.suggestions[0]!.segmentIds).toEqual([SEG_A]);
    expect(hallucinatedWarnings).toHaveLength(1);
    expect(hallucinatedWarnings[0]).toMatch(/code J02\.9/);
  });
});

describe("tryParseModelOutput", () => {
  it("accepts raw JSON", () => {
    expect(tryParseModelOutput(JSON.stringify(validOutput())).ok).toBe(true);
  });
  it("accepts fenced JSON", () => {
    expect(tryParseModelOutput("```json\n" + JSON.stringify(validOutput()) + "\n```").ok).toBe(
      true,
    );
  });
  it("rejects non-JSON", () => {
    expect(tryParseModelOutput("nope").ok).toBe(false);
  });
  it("rejects schema-violating JSON", () => {
    const bad = {
      suggestions: [{ ...suggestion(), code: "NOT_A_CODE" }],
      warnings: [],
    };
    expect(tryParseModelOutput(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe("CodeSuggestionGenerationError", () => {
  it("preserves rawContent and attempts", () => {
    const err = new CodeSuggestionGenerationError("test", { rawContent: "<raw>", attempts: 2 });
    expect(err.name).toBe("CodeSuggestionGenerationError");
    expect(err.rawContent).toBe("<raw>");
    expect(err.attempts).toBe(2);
  });
});
