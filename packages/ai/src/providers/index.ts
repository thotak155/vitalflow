import type { AICompletionRequest, AIMessage, AIModel } from "@vitalflow/types";

export interface CompletionChunk {
  delta: string;
  done: boolean;
}

export interface AIProviderUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface AICompletionResult {
  readonly content: string;
  readonly messages: readonly AIMessage[];
  readonly usage: AIProviderUsage;
  readonly latencyMs: number;
}

export interface AIProvider {
  readonly name: "anthropic" | "openai";
  readonly supports: readonly AIModel[];
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
  stream(request: AICompletionRequest): AsyncIterable<CompletionChunk>;
}

export { AnthropicProvider } from "./anthropic.js";
export { OpenAIProvider } from "./openai.js";
