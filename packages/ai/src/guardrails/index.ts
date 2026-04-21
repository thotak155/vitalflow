import { redactPhi } from "@vitalflow/shared-utils/phi";
import type { AICompletionRequest } from "@vitalflow/types";

/**
 * Guardrails enforced on every AI request before it leaves our network.
 * Extend this chain with additional policy checks (PII classification,
 * jailbreak detection, prompt-injection heuristics) as they become available.
 */
export function applyGuardrails(request: AICompletionRequest): AICompletionRequest {
  return {
    ...request,
    messages: request.messages.map((m) => ({
      ...m,
      content: typeof m.content === "string" ? redactPhiFromText(m.content) : m.content,
    })),
  };
}

const SSN = /\b\d{3}-?\d{2}-?\d{4}\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function redactPhiFromText(input: string): string {
  return input
    .replace(SSN, "[REDACTED_SSN]")
    .replace(CARD, "[REDACTED_CARD]")
    .replace(EMAIL, "[REDACTED_EMAIL]");
}

export { redactPhi };
