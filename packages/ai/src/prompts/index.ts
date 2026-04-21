export const CLINICAL_SUMMARY_SYSTEM = `You are a clinical documentation assistant for VitalFlow.
Summarize the encounter using structured SOAP format (Subjective, Objective,
Assessment, Plan). Never invent lab values, medications, or diagnoses. If
information is missing, say "not documented". Output must be reviewable by a
licensed clinician before entering the chart.`;

export const TRIAGE_SYSTEM = `You are a triage-support assistant. Produce a
differential list ordered by clinical plausibility with citations to the
encounter context provided. You do not provide definitive diagnoses or
treatment; you surface options for a clinician to evaluate.`;

export interface PromptTemplate<T> {
  readonly id: string;
  readonly system: string;
  render(input: T): string;
}

// ---------- Versioned prompt registry ---------------------------------------

import * as soapV1_0_0 from "./scribe/soap/v1.0.0.js";
import * as codeSuggestionsV1_0_0 from "./scribe/code_suggestions/v1.0.0.js";

/**
 * Shape shared by every versioned prompt module. The service layer picks a
 * version via `selectPromptVersion` and then uses these exports uniformly.
 */
export interface VersionedPromptModule {
  readonly system: string;
  readonly buildUserPrompt: (input: never) => string;
  readonly outputJsonSchema: Readonly<Record<string, unknown>>;
  readonly metadata: {
    readonly id: string;
    readonly version: string;
    readonly createdAt: string;
    readonly modelDefault: string;
  };
}

export const SOAP_PROMPT_REGISTRY = {
  "1.0.0": soapV1_0_0,
} as const;

export type SoapPromptVersion = keyof typeof SOAP_PROMPT_REGISTRY;

export const SOAP_PROMPT_LATEST_STABLE: SoapPromptVersion = "1.0.0";

/**
 * Resolve the SOAP prompt version to use for a given request.
 *
 * Selection precedence:
 *   1. Explicit per-session override (e.g. ai_scribe_sessions.prompt_version_override)
 *   2. Env var (AI_SCRIBE_SOAP_PROMPT_VERSION)
 *   3. LATEST_STABLE fallback
 *
 * Throws if a non-existent version is requested — callers should never pass
 * an unvalidated string; plumb through the registry's key type instead.
 */
export function selectSoapPromptVersion(params: {
  override?: string | null;
  envDefault?: string | null;
}): SoapPromptVersion {
  const candidate = params.override ?? params.envDefault ?? SOAP_PROMPT_LATEST_STABLE;
  if (!(candidate in SOAP_PROMPT_REGISTRY)) {
    throw new Error(
      `Unknown SOAP prompt version "${candidate}". Known: ${Object.keys(SOAP_PROMPT_REGISTRY).join(", ")}`,
    );
  }
  return candidate as SoapPromptVersion;
}

export function getSoapPromptModule(version: SoapPromptVersion) {
  return SOAP_PROMPT_REGISTRY[version];
}

export { soapV1_0_0 };

// ---------- Code-suggestions prompt registry --------------------------------

export const CODE_SUGGESTIONS_PROMPT_REGISTRY = {
  "1.0.0": codeSuggestionsV1_0_0,
} as const;

export type CodeSuggestionsPromptVersion = keyof typeof CODE_SUGGESTIONS_PROMPT_REGISTRY;

export const CODE_SUGGESTIONS_PROMPT_LATEST_STABLE: CodeSuggestionsPromptVersion = "1.0.0";

/**
 * Resolve the code-suggestions prompt version to use for a given request.
 *
 * Selection precedence:
 *   1. Explicit per-session override
 *   2. Env var (AI_SCRIBE_CODES_PROMPT_VERSION)
 *   3. LATEST_STABLE fallback
 *
 * Throws if a non-existent version is requested.
 */
export function selectCodeSuggestionsPromptVersion(params: {
  override?: string | null;
  envDefault?: string | null;
}): CodeSuggestionsPromptVersion {
  const candidate = params.override ?? params.envDefault ?? CODE_SUGGESTIONS_PROMPT_LATEST_STABLE;
  if (!(candidate in CODE_SUGGESTIONS_PROMPT_REGISTRY)) {
    throw new Error(
      `Unknown code-suggestions prompt version "${candidate}". Known: ${Object.keys(CODE_SUGGESTIONS_PROMPT_REGISTRY).join(", ")}`,
    );
  }
  return candidate as CodeSuggestionsPromptVersion;
}

export function getCodeSuggestionsPromptModule(version: CodeSuggestionsPromptVersion) {
  return CODE_SUGGESTIONS_PROMPT_REGISTRY[version];
}

export { codeSuggestionsV1_0_0 };
