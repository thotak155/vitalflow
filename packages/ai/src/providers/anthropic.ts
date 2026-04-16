import Anthropic from "@anthropic-ai/sdk";

import type { AICompletionRequest, AIMessage, AIModel } from "@vitalflow/types";

import type { AIProvider, CompletionChunk } from "./index.js";

export class AnthropicProvider implements AIProvider {
  public readonly name = "anthropic" as const;
  public readonly supports: readonly AIModel[] = [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ];

  private readonly client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required");
    }
    this.client = new Anthropic({ apiKey });
  }

  async complete(
    request: AICompletionRequest,
  ): Promise<{ content: string; messages: AIMessage[] }> {
    const system = request.messages.find((m) => m.role === "system")?.content;
    const turns = request.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      system,
      messages: turns,
    });

    const content = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    return { content, messages: [...request.messages, { role: "assistant", content }] };
  }

  async *stream(request: AICompletionRequest): AsyncIterable<CompletionChunk> {
    const system = request.messages.find((m) => m.role === "system")?.content;
    const turns = request.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const stream = this.client.messages.stream({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      system,
      messages: turns,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { delta: event.delta.text, done: false };
      }
    }
    yield { delta: "", done: true };
  }
}
