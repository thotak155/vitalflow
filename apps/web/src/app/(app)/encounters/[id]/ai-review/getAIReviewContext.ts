import {
  SoapDraftSchema,
  type AIScribeCodeSuggestion,
  type AIScribeSession,
  type AIScribeTranscriptSegment,
  type Confidence,
  type Row,
  type SoapDraft,
} from "@vitalflow/types";

import { createVitalFlowServerClient } from "@vitalflow/auth/server";

import type { AppSession } from "../../../../../lib/session.js";

/**
 * Permissions derived once in the server component and passed to child
 * components as booleans. No child re-checks.
 */
export interface AIReviewPermissions {
  readonly canView: boolean;
  readonly canStart: boolean;
  readonly canCancel: boolean;
  readonly canAccept: boolean;
  readonly canReject: boolean;
}

export interface AIReviewContext {
  readonly session: AIScribeSession | null;
  readonly segments: readonly AIScribeTranscriptSegment[];
  readonly draft: SoapDraft | null;
  readonly codes: readonly AIScribeCodeSuggestion[];
  readonly permissions: AIReviewPermissions;
  /**
   * True if the encounter already has a signed current note — the UI still
   * renders the review, but the Accept action will refuse with a 409 equiv.
   */
  readonly encounterHasSignedNote: boolean;
}

/**
 * Single-pass fetch for the AI Review card. All reads guard by tenant. Runs
 * inside a Server Component, so cost is one DB round-trip per query —
 * acceptable for a card that is only rendered when the encounter page is.
 *
 * Returns `session: null` and all empty collections when no scribe session
 * exists for this encounter — the UI then renders state A (Intake).
 */
export async function getAIReviewContext(
  encounterId: string,
  session: AppSession,
): Promise<AIReviewContext> {
  const permissions = derivePermissions(session);

  // Without ai:invoke, we don't even fetch — the card renders hidden.
  if (!permissions.canView) {
    return emptyContext(permissions);
  }

  const supabase = await createVitalFlowServerClient();

  const { data: latestSession } = await supabase
    .from("ai_scribe_sessions")
    .select(
      "id, tenant_id, encounter_id, patient_id, created_by, source, status, " +
        "transcribe_request_id, generate_request_id, suggest_request_id, " +
        "accepted_note_id, audio_storage_path, total_cost_micros_usd, " +
        "total_latency_ms, error_message, metadata, created_at, updated_at",
    )
    .eq("encounter_id", encounterId)
    .eq("tenant_id", session.tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Always check for a signed current note — accept action refuses if so.
  // "Current" = the tip of the note chain: highest version whose status
  // is not 'amended'. If that row is 'signed', accept is blocked.
  const { data: currentNoteRaw } = await supabase
    .from("encounter_notes")
    .select("id, status")
    .eq("encounter_id", encounterId)
    .eq("tenant_id", session.tenantId)
    .neq("status", "amended")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentNote = currentNoteRaw as Pick<Row<"encounter_notes">, "id" | "status"> | null;
  const encounterHasSignedNote = currentNote?.status === "signed";

  if (!latestSession) {
    return { ...emptyContext(permissions), encounterHasSignedNote };
  }

  const scribeSession = toScribeSession(latestSession);

  // Fetch segments + draft + codes in parallel. All scoped by session_id +
  // tenant_id (RLS also enforces tenant).
  const [segmentsRes, draftRes, codesRes] = await Promise.all([
    supabase
      .from("ai_scribe_transcript_segments")
      .select(
        "id, tenant_id, session_id, sequence_index, start_ms, end_ms, speaker, text, partial, created_at",
      )
      .eq("session_id", scribeSession.id)
      .eq("tenant_id", session.tenantId)
      .order("sequence_index", { ascending: true }),
    scribeSession.generateRequestId
      ? supabase
          .from("ai_completions")
          .select("content")
          .eq("request_id", scribeSession.generateRequestId)
          .eq("tenant_id", session.tenantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as { content: string } | null, error: null }),
    supabase
      .from("ai_scribe_code_suggestions")
      .select(
        "id, tenant_id, session_id, encounter_id, type, code_system, code, description, " +
          "rationale, missing_documentation, source, confidence, rank, segment_ids, " +
          "accepted_at, accepted_by, rejected_at, created_at",
      )
      .eq("session_id", scribeSession.id)
      .eq("tenant_id", session.tenantId)
      .order("type", { ascending: true })
      .order("rank", { ascending: true }),
  ]);

  const segments = (segmentsRes.data ?? []).map(toSegment);
  const draft = parseDraft(draftRes.data?.content);
  const codes = (codesRes.data ?? []).map(toCodeSuggestion);

  return {
    session: scribeSession,
    segments,
    draft,
    codes,
    permissions,
    encounterHasSignedNote,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function derivePermissions(session: AppSession): AIReviewPermissions {
  const canView = session.permissions.includes("ai:invoke");
  const canWrite = session.permissions.includes("clinical:write");
  const isImpersonating = !!session.impersonation;

  return {
    canView,
    canStart: canView,
    canCancel: canView,
    canAccept: canView && canWrite && !isImpersonating,
    canReject: canView,
  };
}

function emptyContext(permissions: AIReviewPermissions): AIReviewContext {
  return {
    session: null,
    segments: [],
    draft: null,
    codes: [],
    permissions,
    encounterHasSignedNote: false,
  };
}

function parseDraft(raw: string | null | undefined): SoapDraft | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    const result = SoapDraftSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

type DbSessionRow = Row<"ai_scribe_sessions">;

function toScribeSession(row: DbSessionRow): AIScribeSession {
  return {
    id: row.id as AIScribeSession["id"],
    tenantId: row.tenant_id as AIScribeSession["tenantId"],
    encounterId: row.encounter_id as AIScribeSession["encounterId"],
    patientId: row.patient_id as AIScribeSession["patientId"],
    createdBy: row.created_by as AIScribeSession["createdBy"],
    source: row.source as AIScribeSession["source"],
    status: row.status as AIScribeSession["status"],
    transcribeRequestId: row.transcribe_request_id,
    generateRequestId: row.generate_request_id,
    suggestRequestId: row.suggest_request_id,
    acceptedNoteId: row.accepted_note_id,
    audioStoragePath: row.audio_storage_path,
    totalCostMicrosUsd: row.total_cost_micros_usd,
    totalLatencyMs: row.total_latency_ms,
    errorMessage: row.error_message,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type DbSegmentRow = Row<"ai_scribe_transcript_segments">;

function toSegment(row: DbSegmentRow): AIScribeTranscriptSegment {
  return {
    id: row.id as AIScribeTranscriptSegment["id"],
    tenantId: row.tenant_id as AIScribeTranscriptSegment["tenantId"],
    sessionId: row.session_id as AIScribeTranscriptSegment["sessionId"],
    sequenceIndex: row.sequence_index,
    startMs: row.start_ms,
    endMs: row.end_ms,
    speaker: row.speaker,
    text: row.text,
    partial: row.partial ?? false,
    createdAt: row.created_at,
  };
}

type DbCodeRow = Row<"ai_scribe_code_suggestions">;

function toCodeSuggestion(row: DbCodeRow): AIScribeCodeSuggestion {
  return {
    id: row.id as AIScribeCodeSuggestion["id"],
    tenantId: row.tenant_id as AIScribeCodeSuggestion["tenantId"],
    sessionId: row.session_id as AIScribeCodeSuggestion["sessionId"],
    encounterId: row.encounter_id as AIScribeCodeSuggestion["encounterId"],
    type: row.type as AIScribeCodeSuggestion["type"],
    codeSystem: row.code_system as AIScribeCodeSuggestion["codeSystem"],
    code: row.code,
    description: row.description,
    rationale: row.rationale ?? "",
    missingDocumentation: row.missing_documentation ?? [],
    source: row.source as AIScribeCodeSuggestion["source"],
    confidence: row.confidence as unknown as Confidence,
    rank: row.rank,
    segmentIds: (row.segment_ids ?? []) as AIScribeCodeSuggestion["segmentIds"],
    acceptedAt: row.accepted_at,
    acceptedBy: (row.accepted_by ?? null) as AIScribeCodeSuggestion["acceptedBy"],
    rejectedAt: row.rejected_at,
    createdAt: row.created_at,
  };
}
