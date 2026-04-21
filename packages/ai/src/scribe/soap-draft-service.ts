import {
  AIModelSchema,
  type AIMessage,
  type AIModel,
  type AIScribeTranscriptSegment,
  type AIScribeTranscriptSegmentId,
  type Confidence,
  type SoapDraft,
  type SoapSection,
} from "@vitalflow/types";

import {
  getSoapPromptModule,
  selectSoapPromptVersion,
  type SoapPromptVersion,
} from "../prompts/index.js";
import {
  SoapModelOutputSchema,
  type SoapModelOutput,
  type SoapModelSection,
} from "../prompts/scribe/soap/v1.0.0.js";
import type { AIProvider } from "../providers/index.js";

import type { ScribeServiceContext, SoapDraftService } from "./services.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL: AIModel = "claude-opus-4-7";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 8192;
const PLACEHOLDER_TEXT = "Not documented.";
const REPAIR_NUDGE =
  "Your previous response was not valid JSON matching the required schema. Return ONLY the JSON object. No code fences, no prose, no commentary.";

/**
 * Per-million-token USD rates. Hard-coded for V1; update when contract rates
 * change. Cost is a rough accounting figure, not a billing source of truth.
 */
const COST_RATES_PER_MILLION: Record<string, { readonly input: number; readonly output: number }> =
  {
    "claude-opus-4-7": { input: 15, output: 75 },
    "claude-opus-4-6": { input: 15, output: 75 },
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-haiku-4-5": { input: 0.8, output: 4 },
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gemini-2.0-flash": { input: 0.075, output: 0.3 },
  };

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SoapGenerationError extends Error {
  public readonly rawContent: string;
  public readonly attempts: number;

  constructor(message: string, opts: { rawContent: string; attempts: number; cause?: unknown }) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = "SoapGenerationError";
    this.rawContent = opts.rawContent;
    this.attempts = opts.attempts;
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export interface SoapDraftServiceDeps {
  readonly provider: AIProvider;
  readonly envPromptVersion?: string | null;
  /**
   * Setting-driven default model for SOAP synthesis. Typically read from
   * AI_SCRIBE_SOAP_MODEL at service construction. `params.modelOverride`
   * still wins over this; this loses to both the override and falls back
   * to the module default (`claude-opus-4-7`) when null/invalid.
   */
  readonly envDefaultModel?: string | null;
}

export class SoapDraftServiceImpl implements SoapDraftService {
  constructor(private readonly deps: SoapDraftServiceDeps) {}

  async generate(
    ctx: ScribeServiceContext,
    params: Parameters<SoapDraftService["generate"]>[1],
  ): Promise<Awaited<ReturnType<SoapDraftService["generate"]>>> {
    const version = selectSoapPromptVersion({
      override: params.promptVersionOverride ?? null,
      envDefault: this.deps.envPromptVersion ?? null,
    });
    const promptModule = getSoapPromptModule(version);

    // Empty transcript: deterministic placeholder, no model call.
    if (params.segments.length === 0) {
      return emptyTranscriptResult(promptModule.metadata.id, version);
    }

    const model = resolveModel(params.modelOverride ?? this.deps.envDefaultModel ?? undefined);
    const messages: AIMessage[] = [
      { role: "system", content: promptModule.system },
      {
        role: "user",
        content: promptModule.buildUserPrompt({
          segments: params.segments,
          patientContextHints: params.patientContextHints,
          outputMode: "json",
        }),
      },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatencyMs = 0;
    let lastContent = "";
    let parsed: SoapModelOutput | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.deps.provider.complete({
        model,
        messages,
        temperature: DEFAULT_TEMPERATURE,
        maxTokens: DEFAULT_MAX_TOKENS,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        requestId: params.aiRequestId,
      });
      lastContent = result.content;
      totalInputTokens += result.usage.inputTokens;
      totalOutputTokens += result.usage.outputTokens;
      totalLatencyMs += result.latencyMs;

      const attempted = tryParseModelOutput(result.content);
      if (attempted.ok) {
        parsed = attempted.value;
        break;
      }

      if (attempt === 0) {
        messages.push({ role: "assistant", content: result.content });
        messages.push({ role: "user", content: REPAIR_NUDGE });
      }
    }

    if (!parsed) {
      throw new SoapGenerationError(
        "SOAP generation failed: model output did not match schema after repair attempt",
        { rawContent: lastContent, attempts: 2 },
      );
    }

    const { sanitized, hallucinatedWarnings } = sanitizeSegmentIds(parsed, params.segments);
    const draft = liftToFullDraft(sanitized, params.segments);
    draft.warnings = [...draft.warnings, ...hallucinatedWarnings];

    return {
      draft,
      tokensIn: totalInputTokens,
      tokensOut: totalOutputTokens,
      latencyMs: totalLatencyMs,
      costMicrosUsd: computeCostMicrosUsd(model, totalInputTokens, totalOutputTokens),
      promptId: promptModule.metadata.id,
      promptVersion: version,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for unit tests)
// ---------------------------------------------------------------------------

export function resolveModel(override?: string): AIModel {
  if (!override) return DEFAULT_MODEL;
  const parsed = AIModelSchema.safeParse(override);
  return parsed.success ? parsed.data : DEFAULT_MODEL;
}

/**
 * Best-effort JSON extraction + Zod validation. Handles:
 *   - raw JSON
 *   - JSON wrapped in ```json ... ``` or ``` ... ``` code fences
 *   - Leading/trailing commentary around a single top-level object
 */
export function tryParseModelOutput(
  raw: string,
): { ok: true; value: SoapModelOutput } | { ok: false; reason: string } {
  const extracted = extractJson(raw);
  if (extracted === null) return { ok: false, reason: "no_json_found" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch (err) {
    return { ok: false, reason: `parse_error: ${(err as Error).message}` };
  }

  const result = SoapModelOutputSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "schema_mismatch" };
  }
  return { ok: true, value: result.data };
}

function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip ```json ... ``` or ``` ... ``` code fence
  const fenceMatch = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

/**
 * Drop any segmentId that doesn't belong to the session. Emits one
 * Off-context warning per section that had drops.
 */
export function sanitizeSegmentIds(
  output: SoapModelOutput,
  segments: readonly AIScribeTranscriptSegment[],
): { sanitized: SoapModelOutput; hallucinatedWarnings: string[] } {
  const valid = new Set<string>(segments.map((s) => s.id as unknown as string));
  const warnings: string[] = [];

  const sanitizeSection = (section: SoapModelSection, name: string): SoapModelSection => {
    const kept: string[] = [];
    let dropped = 0;
    for (const id of section.segmentIds) {
      if (valid.has(id)) kept.push(id);
      else dropped += 1;
    }
    if (dropped > 0) {
      warnings.push(
        `Off-context: ${dropped} hallucinated segment reference${dropped === 1 ? "" : "s"} dropped from ${name}`,
      );
    }
    return { ...section, segmentIds: kept };
  };

  return {
    sanitized: {
      subjective: sanitizeSection(output.subjective, "subjective"),
      objective: sanitizeSection(output.objective, "objective"),
      assessment: sanitizeSection(output.assessment, "assessment"),
      plan: sanitizeSection(output.plan, "plan"),
      warnings: output.warnings,
    },
    hallucinatedWarnings: warnings,
  };
}

export function liftToFullDraft(
  model: SoapModelOutput,
  segments: readonly AIScribeTranscriptSegment[],
): SoapDraft {
  const byId = new Map<string, AIScribeTranscriptSegment>(
    segments.map((s) => [s.id as unknown as string, s]),
  );

  const liftSection = (section: SoapModelSection): SoapSection => {
    const grounding = computeGroundingScore(section, byId);
    const confidence: Confidence = {
      model_self: section.confidence,
      grounding,
      combined: harmonicMean(section.confidence, grounding),
    };
    return {
      text: section.text,
      segmentIds: section.segmentIds as unknown as AIScribeTranscriptSegmentId[],
      confidence,
    };
  };

  return {
    subjective: liftSection(model.subjective),
    objective: liftSection(model.objective),
    assessment: liftSection(model.assessment),
    plan: liftSection(model.plan),
    warnings: model.warnings,
  };
}

export function computeGroundingScore(
  section: SoapModelSection,
  segmentsById: Map<string, AIScribeTranscriptSegment>,
): number {
  if (section.text.trim() === PLACEHOLDER_TEXT) return 1;

  const sectionTokens = tokenize(section.text);
  if (sectionTokens.length === 0) return 0;
  if (section.segmentIds.length === 0) return 0;

  const citedTokens = new Set<string>();
  for (const id of section.segmentIds) {
    const seg = segmentsById.get(id);
    if (!seg) continue;
    for (const tok of tokenize(seg.text)) citedTokens.add(tok);
  }

  let matched = 0;
  for (const tok of sectionTokens) {
    if (citedTokens.has(tok)) matched += 1;
  }
  return matched / sectionTokens.length;
}

export function harmonicMean(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return (2 * a * b) / (a + b);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

export function computeCostMicrosUsd(
  model: AIModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = COST_RATES_PER_MILLION[model];
  if (!rates) return 0;
  // USD per million tokens → microUSD per token
  const costUsd = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
  return Math.round(costUsd * 1_000_000);
}

function emptyTranscriptResult(
  promptId: string,
  version: SoapPromptVersion,
): Awaited<ReturnType<SoapDraftService["generate"]>> {
  const zeroConfidence: Confidence = { model_self: 0, grounding: 1, combined: 0 };
  const placeholder: SoapSection = {
    text: PLACEHOLDER_TEXT,
    segmentIds: [],
    confidence: zeroConfidence,
  };
  return {
    draft: {
      subjective: placeholder,
      objective: placeholder,
      assessment: placeholder,
      plan: placeholder,
      warnings: ["Missing: transcript was empty; no SOAP content generated"],
    },
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    costMicrosUsd: 0,
    promptId,
    promptVersion: version,
  };
}
