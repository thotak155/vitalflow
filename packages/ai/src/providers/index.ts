import type { AICompletionRequest, AIMessage, AIModel } from "@vitalflow/types";

export interface CompletionChunk {
  delta: string;
  done: boolean;
}

export interface AIProvider {
  readonly name: "anthropic" | "openai";
  readonly supports: readonly AIModel[];
  complete(request: AICompletionRequest): Promise<{ content: string; messages: AIMessage[] }>;
  stream(request: AICompletionRequest): AsyncIterable<CompletionChunk>;
}

export { AnthropicProvider } from "./anthropic.js";
export { OpenAIProvider } from "./openai.js";
