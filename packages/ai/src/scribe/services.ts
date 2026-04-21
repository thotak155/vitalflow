import type {
  AcceptDraftInput,
  AcceptDraftResponse,
  AIScribeCodeSuggestion,
  AIScribeSession,
  AIScribeSessionId,
  AIScribeTranscriptSegment,
  CreateScribeSessionInput,
  CreateScribeSessionResponse,
  RejectDraftInput,
  SessionView,
  SoapDraft,
  SubmitTranscriptInput,
} from "@vitalflow/types";
import type { TenantId, UserId } from "@vitalflow/types";

/**
 * AI Scribe service contracts. Implementations land in a follow-up PR — this
 * PR lands the typed contracts + DB schema + route stubs so downstream UI can
 * be built against a stable interface.
 *
 * See docs/ai-scribe.md for the full design and failure-handling rules.
 */

export interface ScribeServiceContext {
  tenantId: TenantId;
  userId: UserId;
  isImpersonating?: boolean;
}

// ---------- Top-level orchestration ------------------------------------------

export interface ScribeSessionService {
  /**
   * Create a new scribe session for an encounter. Validates:
   *   - encounter belongs to tenant
   *   - caller has ai:invoke
   *   - no signed current note (allowed but acceptance will 409 later)
   *
   * Returns a signed upload URL when source=audio_upload.
   */
  create(
    ctx: ScribeServiceContext,
    input: CreateScribeSessionInput,
  ): Promise<CreateScribeSessionResponse>;

  /** Full session view — used by UI polling. */
  get(ctx: ScribeServiceContext, id: AIScribeSessionId): Promise<SessionView>;

  /** Cancel an active session. Running steps are best-effort abandoned. */
  cancel(ctx: ScribeServiceContext, id: AIScribeSessionId): Promise<AIScribeSession>;

  /**
   * Submit transcript content — either a storage path (audio already uploaded)
   * or pasted text. Kicks off the pipeline: transcribe (if audio) → generate →
   * suggest codes.
   */
  submitTranscript(
    ctx: ScribeServiceContext,
    id: AIScribeSessionId,
    input: SubmitTranscriptInput,
  ): Promise<AIScribeSession>;

  /**
   * Accept the draft into encounter_notes. Inserts a row with status='draft',
   * ai_assisted=true. If acceptedCodes[] is non-empty, inserts corresponding
   * diagnosis_assignments rows. Never signs the note.
   */
  accept(
    ctx: ScribeServiceContext,
    id: AIScribeSessionId,
    input: AcceptDraftInput,
  ): Promise<AcceptDraftResponse>;

  /** Reject the draft. Writes an ai_feedback row and marks the session rejected. */
  reject(
    ctx: ScribeServiceContext,
    id: AIScribeSessionId,
    input: RejectDraftInput,
  ): Promise<AIScribeSession>;
}

// ---------- Step services ----------------------------------------------------

/** Audio file (multipart path) → array of timestamped transcript segments. */
export interface TranscriptionService {
  /** Transcribe audio already uploaded to Supabase Storage. */
  transcribeAudio(
    ctx: ScribeServiceContext,
    params: {
      sessionId: AIScribeSessionId;
      storagePath: string;
      modelOverride?: string;
    },
  ): Promise<{
    segments: Omit<AIScribeTranscriptSegment, "id" | "createdAt">[];
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    costMicrosUsd: number;
  }>;

  /** Normalize a pasted free-text transcript into sentence/paragraph segments. */
  chunkText(
    ctx: ScribeServiceContext,
    params: {
      sessionId: AIScribeSessionId;
      text: string;
    },
  ): Promise<{
    segments: Omit<AIScribeTranscriptSegment, "id" | "createdAt">[];
  }>;
}

/** Transcript segments + patient context → structured SOAP draft with trace refs. */
export interface SoapDraftService {
  generate(
    ctx: ScribeServiceContext,
    params: {
      sessionId: AIScribeSessionId;
      segments: readonly AIScribeTranscriptSegment[];
      patientContextHints: {
        ageYears?: number;
        sexAtBirth?: string;
        chiefComplaint?: string;
        knownAllergies?: readonly string[];
        currentMedications?: readonly string[];
      };
      modelOverride?: string;
    },
  ): Promise<{
    draft: SoapDraft;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    costMicrosUsd: number;
  }>;
}

/** SOAP + transcript → ICD-10 and CPT suggestions. */
export interface CodeSuggestionService {
  suggest(
    ctx: ScribeServiceContext,
    params: {
      sessionId: AIScribeSessionId;
      draft: SoapDraft;
      segments: readonly AIScribeTranscriptSegment[];
      modelOverride?: string;
    },
  ): Promise<{
    codes: Omit<AIScribeCodeSuggestion, "id" | "tenantId" | "sessionId" | "encounterId" | "createdAt">[];
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    costMicrosUsd: number;
  }>;
}

// ---------- Bundle -----------------------------------------------------------

export interface ScribeServices {
  sessions: ScribeSessionService;
  transcription: TranscriptionService;
  draft: SoapDraftService;
  codes: CodeSuggestionService;
}
