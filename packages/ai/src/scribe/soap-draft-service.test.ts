import { describe, expect, it, vi } from "vitest";

import type {
  AICompletionRequest,
  AIScribeSessionId,
  AIScribeTranscriptSegment,
  TenantId,
  UserId,
} from "@vitalflow/types";

import type { AICompletionResult, AIProvider, CompletionChunk } from "../providers/index.js";

import type { ScribeServiceContext } from "./services.js";
import {
  SoapDraftServiceImpl,
  SoapGenerationError,
  computeCostMicrosUsd,
  computeGroundingScore,
  harmonicMean,
  liftToFullDraft,
  resolveModel,
  sanitizeSegmentIds,
  tryParseModelOutput,
} from "./soap-draft-service.js";

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
    text: "Patient reports sore throat for three days. No fever.",
    partial: false,
    createdAt: "2026-04-20T12:00:00Z",
    ...overrides,
  };
}

function validModelOutput() {
  return {
    subjective: {
      text: "Sore throat for three days. No fever.",
      segmentIds: [SEG_A],
      confidence: 0.9,
    },
    objective: { text: "Not documented.", segmentIds: [], confidence: 0.2 },
    assessment: {
      text: "Likely viral pharyngitis.",
      segmentIds: [SEG_B],
      confidence: 0.7,
    },
    plan: { text: "Supportive care. Return if worsening.", segmentIds: [SEG_B], confidence: 0.6 },
    warnings: ["Unclear: patient volume low in the middle of the visit"],
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

function makeMockProvider(responses: readonly MockResponse[]): {
  provider: AIProvider;
  calls: { request: AICompletionRequest }[];
} {
  const calls: { request: AICompletionRequest }[] = [];
  let idx = 0;
  const provider: AIProvider = {
    name: "anthropic",
    supports: ["claude-opus-4-7"],
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

describe("SoapDraftServiceImpl.generate — happy path", () => {
  it("returns a SoapDraft with lifted Confidence {model_self, grounding, combined}", async () => {
    const { provider } = makeMockProvider([{ content: JSON.stringify(validModelOutput()) }]);
    const svc = new SoapDraftServiceImpl({ provider });
    const result = await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [
        seg({
          id: SEG_A as AIScribeTranscriptSegment["id"],
          text: "sore throat three days no fever",
        }),
        seg({
          id: SEG_B as AIScribeTranscriptSegment["id"],
          sequenceIndex: 1,
          text: "viral pharyngitis supportive care return worsening",
        }),
      ],
      patientContextHints: { ageYears: 30 },
    });

    expect(result.draft.subjective.text).toMatch(/sore throat/i);
    expect(result.draft.subjective.confidence.model_self).toBe(0.9);
    expect(result.draft.subjective.confidence.grounding).toBeGreaterThan(0);
    expect(result.draft.subjective.confidence.combined).toBeGreaterThan(0);
    expect(result.draft.subjective.confidence.combined).toBeLessThanOrEqual(
      result.draft.subjective.confidence.model_self,
    );
    expect(result.draft.warnings).toContain(
      "Unclear: patient volume low in the middle of the visit",
    );
  });

  it("surfaces promptId and promptVersion from the selected module", async () => {
    const { provider } = makeMockProvider([{ content: JSON.stringify(validModelOutput()) }]);
    const svc = new SoapDraftServiceImpl({ provider });
    const result = await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      patientContextHints: {},
    });
    expect(result.promptId).toBe("vitalflow.ai.scribe.soap");
    expect(result.promptVersion).toBe("1.0.0");
  });

  it("calls the provider with claude-opus-4-7 by default and low temperature", async () => {
    const { provider, calls } = makeMockProvider([{ content: JSON.stringify(validModelOutput()) }]);
    const svc = new SoapDraftServiceImpl({ provider });
    await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      patientContextHints: {},
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.request.model).toBe("claude-opus-4-7");
    expect(calls[0]!.request.temperature).toBe(0.2);
    expect(calls[0]!.request.maxTokens).toBeGreaterThanOrEqual(4096);
    expect(calls[0]!.request.tenantId).toBe(TENANT);
    expect(calls[0]!.request.userId).toBe(USER);
    expect(calls[0]!.request.requestId).toBe(REQ);
  });

  it("builds messages with system + user-prompt content", async () => {
    const { provider, calls } = makeMockProvider([{ content: JSON.stringify(validModelOutput()) }]);
    const svc = new SoapDraftServiceImpl({ provider });
    await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg({ id: SEG_A as AIScribeTranscriptSegment["id"] })],
      patientContextHints: { chiefComplaint: "sore throat" },
    });
    const msgs = calls[0]!.request.messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[0]!.content).toMatch(/VitalFlow Scribe/);
    expect(msgs[1]!.role).toBe("user");
    expect(msgs[1]!.content).toContain(`id="${SEG_A}"`);
    expect(msgs[1]!.content).toContain("sore throat");
    expect(msgs[1]!.content).toContain("<output_mode>json</output_mode>");
  });

  it("sums usage and latency across attempts, computes cost for opus-4-7", async () => {
    const { provider } = makeMockProvider([
      {
        content: JSON.stringify(validModelOutput()),
        inputTokens: 1500,
        outputTokens: 700,
        latencyMs: 4200,
      },
    ]);
    const svc = new SoapDraftServiceImpl({ provider });
    const result = await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      patientContextHints: {},
    });
    expect(result.tokensIn).toBe(1500);
    expect(result.tokensOut).toBe(700);
    expect(result.latencyMs).toBe(4200);
    // opus-4-7 = $15/Mtok input, $75/Mtok output
    // = (1500*15 + 700*75) / 1M USD = (22500 + 52500) / 1M = 0.075 USD = 75000 microUSD
    expect(result.costMicrosUsd).toBe(75000);
  });
});

// ---------------------------------------------------------------------------
// Repair flow
// ---------------------------------------------------------------------------

describe("SoapDraftServiceImpl.generate — repair flow", () => {
  it("retries once with a repair nudge when the first response is invalid JSON", async () => {
    const { provider, calls } = makeMockProvider([
      { content: "Here's the note:\n```\nbroken\n```" },
      { content: JSON.stringify(validModelOutput()) },
    ]);
    const svc = new SoapDraftServiceImpl({ provider });
    const result = await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      patientContextHints: {},
    });
    expect(calls).toHaveLength(2);
    // Second call should have 4 messages: system, user, assistant (broken), user (nudge)
    const secondMsgs = calls[1]!.request.messages;
    expect(secondMsgs).toHaveLength(4);
    expect(secondMsgs[2]!.role).toBe("assistant");
    expect(secondMsgs[3]!.role).toBe("user");
    expect(secondMsgs[3]!.content).toMatch(/was not valid JSON/i);
    expect(result.draft.subjective.confidence.model_self).toBe(0.9);
  });

  it("sums usage across both attempts on repair", async () => {
    const { provider } = makeMockProvider([
      { content: "broken", inputTokens: 50, outputTokens: 10 },
      {
        content: JSON.stringify(validModelOutput()),
        inputTokens: 60,
        outputTokens: 200,
      },
    ]);
    const svc = new SoapDraftServiceImpl({ provider });
    const result = await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      patientContextHints: {},
    });
    expect(result.tokensIn).toBe(110);
    expect(result.tokensOut).toBe(210);
  });

  it("throws SoapGenerationError when both attempts fail, preserving raw content", async () => {
    const { provider, calls } = makeMockProvider([
      { content: "broken 1" },
      { content: "still broken 2" },
    ]);
    const svc = new SoapDraftServiceImpl({ provider });
    await expect(
      svc.generate(CTX, {
        sessionId: SESSION,
        aiRequestId: REQ,
        segments: [seg()],
        patientContextHints: {},
      }),
    ).rejects.toMatchObject({
      name: "SoapGenerationError",
      rawContent: "still broken 2",
      attempts: 2,
    });
    expect(calls).toHaveLength(2);
  });

  it("accepts JSON wrapped in ```json fences", async () => {
    const { provider } = makeMockProvider([
      { content: "```json\n" + JSON.stringify(validModelOutput()) + "\n```" },
    ]);
    const svc = new SoapDraftServiceImpl({ provider });
    const result = await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      patientContextHints: {},
    });
    expect(result.draft.subjective.confidence.model_self).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// Hallucinated segment IDs
// ---------------------------------------------------------------------------

describe("SoapDraftServiceImpl.generate — segmentId integrity", () => {
  it("drops segmentIds not belonging to the session and appends Off-context warning", async () => {
    const model = validModelOutput();
    model.subjective.segmentIds = [SEG_A, SEG_C]; // SEG_C not in session
    const { provider } = makeMockProvider([{ content: JSON.stringify(model) }]);
    const svc = new SoapDraftServiceImpl({ provider });
    const result = await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg({ id: SEG_A as AIScribeTranscriptSegment["id"] })],
      patientContextHints: {},
    });
    expect(result.draft.subjective.segmentIds).toEqual([SEG_A]);
    expect(result.draft.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Off-context: 1 hallucinated/)]),
    );
  });
});

// ---------------------------------------------------------------------------
// Empty transcript short-circuit
// ---------------------------------------------------------------------------

describe("SoapDraftServiceImpl.generate — empty transcript", () => {
  it("returns a deterministic placeholder without calling the provider", async () => {
    const complete = vi.fn();
    const provider: AIProvider = {
      name: "anthropic",
      supports: ["claude-opus-4-7"],
      complete,
      // eslint-disable-next-line require-yield
      async *stream(): AsyncIterable<CompletionChunk> {
        throw new Error("stream not used in tests");
      },
    };
    const svc = new SoapDraftServiceImpl({ provider });
    const result = await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [],
      patientContextHints: {},
    });
    expect(complete).not.toHaveBeenCalled();
    expect(result.draft.subjective.text).toBe("Not documented.");
    expect(result.draft.objective.text).toBe("Not documented.");
    expect(result.draft.assessment.text).toBe("Not documented.");
    expect(result.draft.plan.text).toBe("Not documented.");
    expect(result.draft.warnings[0]).toMatch(/^Missing: transcript was empty/);
    expect(result.tokensIn).toBe(0);
    expect(result.tokensOut).toBe(0);
    expect(result.costMicrosUsd).toBe(0);
    expect(result.promptVersion).toBe("1.0.0");
  });
});

// ---------------------------------------------------------------------------
// Model + prompt version overrides
// ---------------------------------------------------------------------------

describe("SoapDraftServiceImpl.generate — overrides", () => {
  it("uses modelOverride when valid", async () => {
    const { provider, calls } = makeMockProvider([{ content: JSON.stringify(validModelOutput()) }]);
    const svc = new SoapDraftServiceImpl({ provider });
    await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      patientContextHints: {},
      modelOverride: "claude-sonnet-4-6",
    });
    expect(calls[0]!.request.model).toBe("claude-sonnet-4-6");
  });

  it("falls back to default when modelOverride is unknown", async () => {
    const { provider, calls } = makeMockProvider([{ content: JSON.stringify(validModelOutput()) }]);
    const svc = new SoapDraftServiceImpl({ provider });
    await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      patientContextHints: {},
      modelOverride: "not-a-real-model",
    });
    expect(calls[0]!.request.model).toBe("claude-opus-4-7");
  });

  it("uses envDefaultModel when no per-session override is set", async () => {
    const { provider, calls } = makeMockProvider([{ content: JSON.stringify(validModelOutput()) }]);
    const svc = new SoapDraftServiceImpl({ provider, envDefaultModel: "claude-sonnet-4-6" });
    await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      patientContextHints: {},
    });
    expect(calls[0]!.request.model).toBe("claude-sonnet-4-6");
  });

  it("prefers params.modelOverride over envDefaultModel", async () => {
    const { provider, calls } = makeMockProvider([{ content: JSON.stringify(validModelOutput()) }]);
    const svc = new SoapDraftServiceImpl({ provider, envDefaultModel: "claude-sonnet-4-6" });
    await svc.generate(CTX, {
      sessionId: SESSION,
      aiRequestId: REQ,
      segments: [seg()],
      patientContextHints: {},
      modelOverride: "claude-haiku-4-5",
    });
    expect(calls[0]!.request.model).toBe("claude-haiku-4-5");
  });

  it("throws on an unknown promptVersionOverride", async () => {
    const { provider } = makeMockProvider([]);
    const svc = new SoapDraftServiceImpl({ provider });
    await expect(
      svc.generate(CTX, {
        sessionId: SESSION,
        aiRequestId: REQ,
        segments: [seg()],
        patientContextHints: {},
        promptVersionOverride: "9.9.9",
      }),
    ).rejects.toThrow(/Unknown SOAP prompt version/);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("resolveModel", () => {
  it("defaults to claude-opus-4-7", () => {
    expect(resolveModel()).toBe("claude-opus-4-7");
    expect(resolveModel(undefined)).toBe("claude-opus-4-7");
  });
  it("accepts a valid AIModel value", () => {
    expect(resolveModel("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });
  it("falls back to default on an unknown value", () => {
    expect(resolveModel("whatever")).toBe("claude-opus-4-7");
  });
});

describe("tryParseModelOutput", () => {
  it("accepts raw JSON", () => {
    const result = tryParseModelOutput(JSON.stringify(validModelOutput()));
    expect(result.ok).toBe(true);
  });
  it("accepts JSON wrapped in ```json fences", () => {
    const result = tryParseModelOutput("```json\n" + JSON.stringify(validModelOutput()) + "\n```");
    expect(result.ok).toBe(true);
  });
  it("accepts JSON with surrounding prose by slicing braces", () => {
    const result = tryParseModelOutput("Here: " + JSON.stringify(validModelOutput()) + " done.");
    expect(result.ok).toBe(true);
  });
  it("rejects non-JSON content", () => {
    const result = tryParseModelOutput("no json here");
    expect(result.ok).toBe(false);
  });
  it("rejects JSON that fails schema validation", () => {
    const bad = { ...validModelOutput(), warnings: ["malformed without tag"] };
    const result = tryParseModelOutput(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });
});

describe("sanitizeSegmentIds", () => {
  const allSegments = [
    seg({ id: SEG_A as AIScribeTranscriptSegment["id"] }),
    seg({ id: SEG_B as AIScribeTranscriptSegment["id"], sequenceIndex: 1 }),
  ];

  it("keeps valid ids and drops foreign ids", () => {
    const output = validModelOutput();
    output.subjective.segmentIds = [SEG_A, SEG_C];
    const { sanitized, hallucinatedWarnings } = sanitizeSegmentIds(output, allSegments);
    expect(sanitized.subjective.segmentIds).toEqual([SEG_A]);
    expect(hallucinatedWarnings).toHaveLength(1);
    expect(hallucinatedWarnings[0]).toMatch(/^Off-context: 1 hallucinated/);
  });
  it("emits no warnings when all ids are valid", () => {
    const output = validModelOutput();
    output.subjective.segmentIds = [SEG_A];
    const { hallucinatedWarnings } = sanitizeSegmentIds(output, allSegments);
    expect(hallucinatedWarnings).toEqual([]);
  });
  it("pluralizes the dropped count in the warning", () => {
    const output = validModelOutput();
    output.subjective.segmentIds = [SEG_A, SEG_B, SEG_C];
    // Only SEG_A is valid in this case; SEG_B and SEG_C should both drop from subjective.
    const onlyA = [seg({ id: SEG_A as AIScribeTranscriptSegment["id"] })];
    // Zero out other sections to keep the assertion scoped to subjective.
    output.objective.segmentIds = [];
    output.assessment.segmentIds = [];
    output.plan.segmentIds = [];
    const { hallucinatedWarnings } = sanitizeSegmentIds(output, onlyA);
    expect(hallucinatedWarnings).toEqual([
      expect.stringMatching(
        /^Off-context: 2 hallucinated segment references dropped from subjective/,
      ),
    ]);
  });
});

describe("computeGroundingScore", () => {
  const byId = new Map<string, AIScribeTranscriptSegment>();
  byId.set(
    SEG_A,
    seg({ id: SEG_A as AIScribeTranscriptSegment["id"], text: "sore throat three days no fever" }),
  );

  it("returns 1 for the 'Not documented.' placeholder", () => {
    const section = { text: "Not documented.", segmentIds: [], confidence: 0.5 };
    expect(computeGroundingScore(section, byId)).toBe(1);
  });
  it("returns 0 when no segmentIds are cited for non-placeholder text", () => {
    const section = { text: "something clinically relevant", segmentIds: [], confidence: 0.5 };
    expect(computeGroundingScore(section, byId)).toBe(0);
  });
  it("computes the fraction of overlapping tokens", () => {
    const section = {
      text: "Sore throat, three days, no fever",
      segmentIds: [SEG_A],
      confidence: 0.9,
    };
    const score = computeGroundingScore(section, byId);
    // All 6 tokens appear in the cited segment → 1.0
    expect(score).toBeCloseTo(1, 5);
  });
  it("penalizes invented tokens", () => {
    const section = {
      text: "Sore throat with abrupt hemoptysis",
      segmentIds: [SEG_A],
      confidence: 0.9,
    };
    const score = computeGroundingScore(section, byId);
    // Tokens: sore, throat, with, abrupt, hemoptysis; only sore+throat match
    expect(score).toBeCloseTo(2 / 5, 5);
  });
});

describe("harmonicMean", () => {
  it("returns the harmonic mean for positive inputs", () => {
    expect(harmonicMean(0.5, 0.5)).toBeCloseTo(0.5, 5);
    expect(harmonicMean(1, 0.5)).toBeCloseTo((2 * 1 * 0.5) / 1.5, 5);
  });
  it("returns 0 when either input is zero", () => {
    expect(harmonicMean(0, 0.9)).toBe(0);
    expect(harmonicMean(0.9, 0)).toBe(0);
  });
});

describe("computeCostMicrosUsd", () => {
  it("computes opus-4-7 cost at 15/75 per MTok", () => {
    expect(computeCostMicrosUsd("claude-opus-4-7", 1_000_000, 0)).toBe(15_000_000);
    expect(computeCostMicrosUsd("claude-opus-4-7", 0, 1_000_000)).toBe(75_000_000);
  });
  it("returns 0 for an unknown model (defensive)", () => {
    expect(computeCostMicrosUsd("unknown" as never, 100, 100)).toBe(0);
  });
});

describe("liftToFullDraft", () => {
  it("produces the richer Confidence shape for every section", () => {
    const output = validModelOutput();
    const draft = liftToFullDraft(output, [
      seg({
        id: SEG_A as AIScribeTranscriptSegment["id"],
        text: "sore throat three days no fever",
      }),
      seg({
        id: SEG_B as AIScribeTranscriptSegment["id"],
        sequenceIndex: 1,
        text: "viral pharyngitis supportive care return worsening",
      }),
    ]);
    for (const section of [draft.subjective, draft.objective, draft.assessment, draft.plan]) {
      expect(section.confidence).toHaveProperty("model_self");
      expect(section.confidence).toHaveProperty("grounding");
      expect(section.confidence).toHaveProperty("combined");
    }
  });
});

// ---------------------------------------------------------------------------
// SoapGenerationError
// ---------------------------------------------------------------------------

describe("SoapGenerationError", () => {
  it("preserves rawContent and attempts", () => {
    const err = new SoapGenerationError("test", { rawContent: "<raw>", attempts: 2 });
    expect(err.name).toBe("SoapGenerationError");
    expect(err.rawContent).toBe("<raw>");
    expect(err.attempts).toBe(2);
  });
});
