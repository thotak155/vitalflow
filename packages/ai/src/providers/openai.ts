import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import type { AICompletionRequest, AIMessage, AIModel } from "@vitalflow/types";

import type { AIProvider, CompletionChunk } from "./index.js";

export class OpenAIProvider implements AIProvider {
  public readonly name = "openai" as const;
  public readonly supports: readonly AIModel[] = ["gpt-4o", "gpt-4o-mini"];

  private readonly client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required");
    }
    this.client = new OpenAI({ apiKey });
  }

  // Tool-call messages aren't yet modeled by our AIMessage abstraction — when
  // we add tool-use, extend AIMessage and drop this filter.
  private toOpenAiMessages(messages: readonly AIMessage[]): ChatCompletionMessageParam[] {
    return messages
      .filter((m): m is AIMessage & { role: "system" | "user" | "assistant" } => m.role !== "tool")
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async complete(
    request: AICompletionRequest,
  ): Promise<{ content: string; messages: AIMessage[] }> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: this.toOpenAiMessages(request.messages),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    });
    const content = response.choices[0]?.message?.content ?? "";
    return { content, messages: [...request.messages, { role: "assistant", content }] };
  }

  async *stream(request: AICompletionRequest): AsyncIterable<CompletionChunk> {
    const stream = await this.client.chat.completions.create({
      model: request.model,
      messages: this.toOpenAiMessages(request.messages),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        yield { delta, done: false };
      }
    }
    yield { delta: "", done: true };
  }
}
