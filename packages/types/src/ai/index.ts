import { z } from "zod";

export const AIModelSchema = z.enum([
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gpt-4o",
  "gpt-4o-mini",
  "gemini-2.0-flash",
]);
export type AIModel = z.infer<typeof AIModelSchema>;

export const AIProviderSchema = z.enum(["anthropic", "openai", "google"]);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export const AIMessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

export const AIMessageSchema = z.object({
  role: AIMessageRoleSchema,
  content: z.string(),
});
export type AIMessage = z.infer<typeof AIMessageSchema>;

export const AICompletionRequestSchema = z.object({
  model: AIModelSchema,
  messages: z.array(AIMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  requestId: z.string().uuid(),
});
export type AICompletionRequest = z.infer<typeof AICompletionRequestSchema>;

// ---------- Scribe --------------------------------------------------------

export * from "./scribe.js";
