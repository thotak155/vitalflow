import {
  AIModelSchema,
  type AICodeSource,
  type AIMessage,
  type AIModel,
  type AIScribeCodeSuggestion,
  type AIScribeTranscriptSegment,
  type AIScribeTranscriptSegmentId,
  type Confidence,
  type SoapDraft,
} from "@vitalflow/types";

import {
  getCodeSuggestionsPromptModule,
  selectCodeSuggestionsPromptVersion,
  type CodeSuggestionsPromptVersion,
} from "../prompts/index.js";
import {
  CodeSuggestionsModelOutputSchema,
  type CodeSuggestionsModelOutput,
  type CodeSuggestionsModelSuggestion,
} from "../prompts/scribe/code_suggestions/v1.0.0.js";
import type { AIProvider } from "../providers/index.js";

import type { CodeSuggestionService, ScribeServiceContext } from "./services.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL: AIModel = "gemini-2.0-flash";
const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_MAX_TOKENS = 4096;
const REPAIR_NUDGE =
  "Your previous response was not valid JSON matching the required schema. Return ONLY the JSON object. No code fences, no prose, no commentary.";

/**
 * Office E/M codes (new + established, 99202–99215). Prompt + server both
 * bias toward underconfidence here because E/M overcoding is the single
 * highest-risk category in ambulatory coding.
 */
const EM_OFFICE_CODES = new Set<string>([
  "99202",
  "99203",
  "99204",
  "99205",
  "99211",
  "99212",
  "99213",
  "99214",
  "99215",
]);
const EM_CONFIDENCE_CAP = 0.7;

/**
 * Multi-factor grounding weights. Sum to 1.0. See CHANGELOG for rationale.
 */
const GROUNDING_WEIGHTS = { transcript: 0.5, soap: 0.3, specificity: 0.2 } as const;

/**
 * Per-million-token USD rates. Same table as SOAP service but codes model
 * default is Gemini Flash which is much cheaper.
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

export class CodeSuggestionGenerationError extends Error {
  public readonly rawContent: string;
  public readonly attempts: number;

  constructor(message: string, opts: { rawContent: string; attempts: number; cause?: unknown }) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = "CodeSuggestionGenerationError";
    this.rawContent = opts.rawContent;
    this.attempts = opts.attempts;
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export interface CodeSuggestionServiceDeps {
  readonly provider: AIProvider;
  readonly envPromptVersion?: string | null;
  /**
   * Setting-driven default model for code suggestions. Typically read from
   * AI_SCRIBE_CODES_MODEL at service construction. `params.modelOverride`
   * still wins; this loses to both the override and falls back to
   * `gemini-2.0-flash` when null/invalid.
   */
  readonly envDefaultModel?: string | null;
}

export class CodeSuggestionServiceImpl implements CodeSuggestionService {
  constructor(private readonly deps: CodeSuggestionServiceDeps) {}

  async suggest(
    ctx: ScribeServiceContext,
    params: Parameters<CodeSuggestionService["suggest"]>[1],
  ): Promise<Awaited<ReturnType<CodeSuggestionService["suggest"]>>> {
    const version = selectCodeSuggestionsPromptVersion({
      override: params.promptVersionOverride ?? null,
      envDefault: this.deps.envPromptVersion ?? null,
    });
    const promptModule = getCodeSuggestionsPromptModule(version);

    // Refusal short-circuit: no transcript AND empty draft → nothing to code.
    if (params.segments.length === 0 && isDraftEmpty(params.draft)) {
      return refusalResult(promptModule.metadata.id, version);
    }

    const model = resolveModel(params.modelOverride ?? this.deps.envDefaultModel ?? undefined);
    const messages: AIMessage[] = [
      { role: "system", content: promptModule.system },
      {
        role: "user",
        content: promptModule.buildUserPrompt({
          segments: params.segments,
          patientContextHints: params.patientContextHints,
          visitContext: params.visitContext,
          soapDraft: params.draft,
        }),
      },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatencyMs = 0;
    let lastContent = "";
    let parsed: CodeSuggestionsModelOutput | null = null;

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
      throw new CodeSuggestionGenerationError(
        "Code suggestion failed: model output did not match schema after repair attempt",
        { rawContent: lastContent, attempts: 2 },
      );
    }

    const { sanitized, hallucinatedWarnings } = sanitizeSegmentIds(parsed, params.segments);
    const codes = sanitized.suggestions.map((s) =>
      liftSuggestion(s, params.draft, params.segments, params.patientContextHints),
    );
    const warnings = [...sanitized.warnings, ...hallucinatedWarnings];

    return {
      codes,
      warnings,
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

export function tryParseModelOutput(
  raw: string,
): { ok: true; value: CodeSuggestionsModelOutput } | { ok: false; reason: string } {
  const extracted = extractJson(raw);
  if (extracted === null) return { ok: false, reason: "no_json_found" };

  let json: unknown;
  try {
    json = JSON.parse(extracted);
  } catch (err) {
    return { ok: false, reason: `parse_error: ${(err as Error).message}` };
  }

  const result = CodeSuggestionsModelOutputSchema.safeParse(json);
  if (!result.success) return { ok: false, reason: "schema_mismatch" };
  return { ok: true, value: result.data };
}

function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenceMatch = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  if (fenceMatch && fenceMatch[1]) return fenceMatch[1].trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

/**
 * Drop foreign segmentIds. Emits one Off-context warning per suggestion that
 * had drops, including the code to make the message actionable.
 */
export function sanitizeSegmentIds(
  output: CodeSuggestionsModelOutput,
  segments: readonly AIScribeTranscriptSegment[],
): { sanitized: CodeSuggestionsModelOutput; hallucinatedWarnings: string[] } {
  const valid = new Set<string>(segments.map((s) => s.id as unknown as string));
  const warnings: string[] = [];

  const sanitizedSuggestions = output.suggestions.map((s) => {
    const kept: string[] = [];
    let dropped = 0;
    for (const id of s.segmentIds) {
      if (valid.has(id)) kept.push(id);
      else dropped += 1;
    }
    if (dropped > 0) {
      warnings.push(
        `Off-context: ${dropped} hallucinated segment reference${dropped === 1 ? "" : "s"} dropped from code ${s.code}`,
      );
    }
    return { ...s, segmentIds: kept };
  });

  return {
    sanitized: { suggestions: sanitizedSuggestions, warnings: output.warnings },
    hallucinatedWarnings: warnings,
  };
}

/**
 * Produce a persistence-ready row, applying:
 *   - E/M confidence cap (model_self ≤ 0.7 for 99202–99215)
 *   - multi-factor grounding
 *   - harmonic-mean combined
 */
export function liftSuggestion(
  s: CodeSuggestionsModelSuggestion,
  draft: SoapDraft,
  segments: readonly AIScribeTranscriptSegment[],
  contextHints: Parameters<CodeSuggestionService["suggest"]>[1]["patientContextHints"],
): Omit<AIScribeCodeSuggestion, "id" | "tenantId" | "sessionId" | "encounterId" | "createdAt"> {
  const capped = EM_OFFICE_CODES.has(s.code)
    ? Math.min(s.confidence, EM_CONFIDENCE_CAP)
    : s.confidence;

  const grounding = computeGrounding(s, draft, segments, contextHints);
  const confidence: Confidence = {
    model_self: capped,
    grounding,
    combined: harmonicMean(capped, grounding),
  };

  return {
    type: s.type,
    codeSystem: s.codeSystem,
    code: s.code,
    description: s.description,
    rationale: s.rationale,
    missingDocumentation: s.missingDocumentation,
    source: s.source as AICodeSource,
    confidence,
    rank: s.rank,
    segmentIds: s.segmentIds as unknown as AIScribeTranscriptSegmentId[],
    acceptedAt: null,
    acceptedBy: null,
    rejectedAt: null,
  };
}

/**
 * Weighted grounding score in [0, 1]:
 *   0.5 * S_transcript + 0.3 * S_soap + 0.2 * S_specificity
 */
export function computeGrounding(
  s: CodeSuggestionsModelSuggestion,
  draft: SoapDraft,
  segments: readonly AIScribeTranscriptSegment[],
  contextHints: Parameters<CodeSuggestionService["suggest"]>[1]["patientContextHints"],
): number {
  const sTranscript = computeTranscriptSupport(s, segments);
  const sSoap = computeSoapSupport(s, draft, contextHints);
  const sSpecificity = computeSpecificity(s.missingDocumentation.length);
  return clamp01(
    GROUNDING_WEIGHTS.transcript * sTranscript +
      GROUNDING_WEIGHTS.soap * sSoap +
      GROUNDING_WEIGHTS.specificity * sSpecificity,
  );
}

/**
 * Fraction of cited segments whose text contains at least one token from the
 * suggestion description. If source !== "transcript" and no segments cited,
 * neutral (1). If source === "transcript" and no segments cited, 0 — the
 * model claimed transcript support but failed to cite it.
 */
export function computeTranscriptSupport(
  s: CodeSuggestionsModelSuggestion,
  segments: readonly AIScribeTranscriptSegment[],
): number {
  if (s.segmentIds.length === 0) {
    return s.source === "transcript" ? 0 : 1;
  }
  const byId = new Map<string, AIScribeTranscriptSegment>(
    segments.map((seg) => [seg.id as unknown as string, seg]),
  );
  const descTokens = new Set(tokenize(s.description));
  if (descTokens.size === 0) return 0;

  let matches = 0;
  let considered = 0;
  for (const id of s.segmentIds) {
    const seg = byId.get(id);
    if (!seg) continue;
    considered += 1;
    const segTokens = tokenize(seg.text);
    if (segTokens.some((t) => descTokens.has(t))) matches += 1;
  }
  if (considered === 0) return 0;
  return matches / considered;
}

/**
 * Fraction of suggestion.rationale tokens that appear in the relevant source
 * text (SOAP draft or patient_context). "Relevant" depends on source:
 *   - soap_only:        match against SOAP draft text only
 *   - patient_context:  match against patient context text only
 *   - transcript:       use whichever scores higher (SOAP-or-context)
 */
export function computeSoapSupport(
  s: CodeSuggestionsModelSuggestion,
  draft: SoapDraft,
  contextHints: Parameters<CodeSuggestionService["suggest"]>[1]["patientContextHints"],
): number {
  const rationaleTokens = tokenize(s.rationale);
  if (rationaleTokens.length === 0) return 0;

  const soapTokens = new Set([
    ...tokenize(draft.subjective.text),
    ...tokenize(draft.objective.text),
    ...tokenize(draft.assessment.text),
    ...tokenize(draft.plan.text),
  ]);

  const contextParts: string[] = [
    ...(contextHints.activeProblemList ?? []),
    ...(contextHints.currentMedications ?? []),
    ...(contextHints.knownAllergies ?? []),
    contextHints.chiefComplaint ?? "",
  ];
  const contextTokens = new Set(tokenize(contextParts.join(" ")));

  const fraction = (haystack: Set<string>): number => {
    let matches = 0;
    for (const t of rationaleTokens) if (haystack.has(t)) matches += 1;
    return matches / rationaleTokens.length;
  };

  if (s.source === "soap_only") return fraction(soapTokens);
  if (s.source === "patient_context") return fraction(contextTokens);
  return Math.max(fraction(soapTokens), fraction(contextTokens));
}

/**
 * Specificity score based on missingDocumentation count. Empty → 1. Each
 * missing item costs 0.15, floored at 0.4.
 */
export function computeSpecificity(missingCount: number): number {
  if (missingCount <= 0) return 1;
  return Math.max(0.4, 1 - 0.15 * missingCount);
}

export function harmonicMean(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return (2 * a * b) / (a + b);
}

export function computeCostMicrosUsd(
  model: AIModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = COST_RATES_PER_MILLION[model];
  if (!rates) return 0;
  const costUsd = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
  return Math.round(costUsd * 1_000_000);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function isDraftEmpty(draft: SoapDraft): boolean {
  const empty = (t: string) => t.trim() === "" || t.trim() === "Not documented.";
  return (
    empty(draft.subjective.text) &&
    empty(draft.objective.text) &&
    empty(draft.assessment.text) &&
    empty(draft.plan.text)
  );
}

function refusalResult(
  promptId: string,
  version: CodeSuggestionsPromptVersion,
): Awaited<ReturnType<CodeSuggestionService["suggest"]>> {
  return {
    codes: [],
    warnings: ["Missing: insufficient documentation for coding"],
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    costMicrosUsd: 0,
    promptId,
    promptVersion: version,
  };
}
