import { z } from "zod";

import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";
import { EncounterIdSchema, PatientIdSchema } from "../clinical/index.js";

// ---------- IDs --------------------------------------------------------------

export const AIScribeSessionIdSchema = z.string().uuid().brand<"AIScribeSessionId">();
export type AIScribeSessionId = z.infer<typeof AIScribeSessionIdSchema>;

export const AIScribeTranscriptSegmentIdSchema = z
  .string()
  .uuid()
  .brand<"AIScribeTranscriptSegmentId">();
export type AIScribeTranscriptSegmentId = z.infer<typeof AIScribeTranscriptSegmentIdSchema>;

export const AIScribeCodeSuggestionIdSchema = z
  .string()
  .uuid()
  .brand<"AIScribeCodeSuggestionId">();
export type AIScribeCodeSuggestionId = z.infer<typeof AIScribeCodeSuggestionIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const AIScribeSessionStatusSchema = z.enum([
  "pending",
  "transcribing",
  "generating",
  "suggesting_codes",
  "awaiting_review",
  "accepted",
  "rejected",
  "cancelled",
  "failed",
]);
export type AIScribeSessionStatus = z.infer<typeof AIScribeSessionStatusSchema>;

export const AIScribeSourceSchema = z.enum(["audio_upload", "transcript_paste", "stream"]);
export type AIScribeSource = z.infer<typeof AIScribeSourceSchema>;

export const AIStepSchema = z.enum(["transcribe", "generate", "codes"]);
export type AIStep = z.infer<typeof AIStepSchema>;

export const AIStepStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped"]);
export type AIStepStatus = z.infer<typeof AIStepStatusSchema>;

export const AICodeTypeSchema = z.enum(["diagnosis", "procedure"]);
export type AICodeType = z.infer<typeof AICodeTypeSchema>;

// ---------- Confidence --------------------------------------------------------

export const ConfidenceSchema = z.object({
  model_self: z.number().min(0).max(1),
  grounding: z.number().min(0).max(1),
  combined: z.number().min(0).max(1),
});
export type Confidence = z.infer<typeof ConfidenceSchema>;

// ---------- Transcript segment -----------------------------------------------

export const AIScribeTranscriptSegmentSchema = z.object({
  id: AIScribeTranscriptSegmentIdSchema,
  tenantId: TenantIdSchema,
  sessionId: AIScribeSessionIdSchema,
  sequenceIndex: z.number().int().min(0),
  startMs: z.number().int().nonnegative().nullable().optional(),
  endMs: z.number().int().nonnegative().nullable().optional(),
  speaker: z.string().max(64).nullable().optional(),
  text: z.string().min(1),
  partial: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type AIScribeTranscriptSegment = z.infer<typeof AIScribeTranscriptSegmentSchema>;

// ---------- SOAP draft (AI output) -------------------------------------------

export const SoapSectionSchema = z.object({
  text: z.string(),
  segmentIds: z.array(AIScribeTranscriptSegmentIdSchema).default([]),
  confidence: z.number().min(0).max(1),
});
export type SoapSection = z.infer<typeof SoapSectionSchema>;

export const SoapDraftSchema = z.object({
  subjective: SoapSectionSchema,
  objective: SoapSectionSchema,
  assessment: SoapSectionSchema,
  plan: SoapSectionSchema,
  warnings: z.array(z.string()).default([]),
});
export type SoapDraft = z.infer<typeof SoapDraftSchema>;

// ---------- Code suggestion --------------------------------------------------

export const AIScribeCodeSuggestionSchema = z.object({
  id: AIScribeCodeSuggestionIdSchema,
  tenantId: TenantIdSchema,
  sessionId: AIScribeSessionIdSchema,
  encounterId: EncounterIdSchema,
  type: AICodeTypeSchema,
  codeSystem: z.enum(["icd10-cm", "cpt"]),
  code: z.string().min(1).max(32),
  description: z.string().min(1).max(512),
  confidence: z.number().min(0).max(1),
  rank: z.number().int().min(1),
  segmentIds: z.array(AIScribeTranscriptSegmentIdSchema).default([]),
  acceptedAt: z.string().datetime().nullable().optional(),
  acceptedBy: UserIdSchema.nullable().optional(),
  rejectedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type AIScribeCodeSuggestion = z.infer<typeof AIScribeCodeSuggestionSchema>;

// ---------- Session ----------------------------------------------------------

export const AIScribeStepSummarySchema = z.object({
  status: AIStepStatusSchema,
  requestId: z.string().uuid().nullable().optional(),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  error: z.string().nullable().optional(),
});
export type AIScribeStepSummary = z.infer<typeof AIScribeStepSummarySchema>;

export const AIScribeSessionSchema = z.object({
  id: AIScribeSessionIdSchema,
  tenantId: TenantIdSchema,
  encounterId: EncounterIdSchema,
  patientId: PatientIdSchema,
  createdBy: UserIdSchema,
  source: AIScribeSourceSchema,
  status: AIScribeSessionStatusSchema,
  transcribeRequestId: z.string().uuid().nullable().optional(),
  generateRequestId: z.string().uuid().nullable().optional(),
  suggestRequestId: z.string().uuid().nullable().optional(),
  acceptedNoteId: z.string().uuid().nullable().optional(),
  audioStoragePath: z.string().nullable().optional(),
  totalCostMicrosUsd: z.number().int().nonnegative().nullable().optional(),
  totalLatencyMs: z.number().int().nonnegative().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AIScribeSession = z.infer<typeof AIScribeSessionSchema>;

// ---------- API request / response shapes -----------------------------------

export const CreateScribeSessionInputSchema = z.object({
  encounterId: EncounterIdSchema,
  source: AIScribeSourceSchema,
  modelOverrides: z
    .object({
      transcribe: z.string().optional(),
      generate: z.string().optional(),
      codes: z.string().optional(),
    })
    .optional(),
});
export type CreateScribeSessionInput = z.infer<typeof CreateScribeSessionInputSchema>;

export const CreateScribeSessionResponseSchema = z.object({
  sessionId: AIScribeSessionIdSchema,
  status: AIScribeSessionStatusSchema,
  uploadUrl: z.string().url().nullable(),
});
export type CreateScribeSessionResponse = z.infer<typeof CreateScribeSessionResponseSchema>;

export const SubmitTranscriptInputSchema = z
  .object({
    storagePath: z.string().optional(),
    text: z.string().optional(),
  })
  .refine((v) => !!v.storagePath !== !!v.text, {
    message: "Provide exactly one of storagePath or text",
  });
export type SubmitTranscriptInput = z.infer<typeof SubmitTranscriptInputSchema>;

export const SessionViewSchema = z.object({
  sessionId: AIScribeSessionIdSchema,
  status: AIScribeSessionStatusSchema,
  steps: z.object({
    transcribe: AIScribeStepSummarySchema,
    generate: AIScribeStepSummarySchema,
    codes: AIScribeStepSummarySchema,
  }),
  draft: SoapDraftSchema.nullable(),
  codes: z.array(AIScribeCodeSuggestionSchema).default([]),
  transcript: z.object({
    segments: z.array(AIScribeTranscriptSegmentSchema).default([]),
  }),
});
export type SessionView = z.infer<typeof SessionViewSchema>;

export const AcceptDraftInputSchema = z.object({
  acceptedCodes: z.array(AIScribeCodeSuggestionIdSchema).default([]),
  editedDraft: z
    .object({
      subjective: z.string().optional(),
      objective: z.string().optional(),
      assessment: z.string().optional(),
      plan: z.string().optional(),
    })
    .optional(),
});
export type AcceptDraftInput = z.infer<typeof AcceptDraftInputSchema>;

export const AcceptDraftResponseSchema = z.object({
  noteId: z.string().uuid(),
  sessionId: AIScribeSessionIdSchema,
  acceptedCodeCount: z.number().int().nonnegative(),
});
export type AcceptDraftResponse = z.infer<typeof AcceptDraftResponseSchema>;

export const RejectDraftInputSchema = z.object({
  reason: z.string().min(1).max(2048),
  correction: z.string().max(65536).optional(),
});
export type RejectDraftInput = z.infer<typeof RejectDraftInputSchema>;
