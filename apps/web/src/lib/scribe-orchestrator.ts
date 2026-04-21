import { randomUUID } from "node:crypto";

import { createVitalFlowAdminClient, type SupabaseAdminClient } from "@vitalflow/auth/admin";
import { logEventBestEffort } from "@vitalflow/auth/audit";
import {
  AnthropicProvider,
  CodeSuggestionServiceImpl,
  SoapDraftServiceImpl,
  type AIProvider,
} from "@vitalflow/ai";
import type {
  AIScribeSessionId,
  AIScribeTranscriptSegment,
  EncounterId,
  Insert,
  PatientId,
  Row,
  TenantId,
  UserId,
  WithRelation,
} from "@vitalflow/types";

import type { AppSession } from "./session.js";

/**
 * Scribe orchestrator — wires AI services into the submitTranscript flow.
 *
 * Pipeline:
 *   session.status = generating   → call SoapDraftServiceImpl.generate
 *     → persist JSON draft to ai_completions, status = suggesting_codes
 *   → call CodeSuggestionServiceImpl.suggest
 *     → insert into ai_scribe_code_suggestions, status = awaiting_review
 *
 * V1 runs inline inside the submitTranscript server action — accepts the
 * Vercel 60s function timeout as a constraint. When the pipeline exceeds
 * that ceiling (long audio, slow model), V2 moves execution to a Supabase
 * Edge Function listening for `ai_scribe_sessions.status = 'generating'`
 * inserts. Same orchestrator function, different invocation surface.
 *
 * Failure policy:
 *   - Any throw in either step marks the session `failed` with a readable
 *     error_message. Session stays viewable so users can retry or cancel.
 *   - Missing ANTHROPIC_API_KEY is treated as a configuration error, not a
 *     500 — same pattern as the clearinghouse stub.
 *   - The orchestrator itself never re-throws; it's fire-and-forget from
 *     the caller's perspective (the UI polls via refresh).
 */

export interface OrchestrateInput {
  readonly sessionId: AIScribeSessionId;
  readonly encounterId: EncounterId;
  readonly session: AppSession;
}

export async function orchestrateScribePipeline(input: OrchestrateInput): Promise<void> {
  const admin = createVitalFlowAdminClient();
  const { session, sessionId, encounterId } = input;

  let provider: AIProvider;
  try {
    provider = new AnthropicProvider();
  } catch (err) {
    await markSessionFailed(
      admin,
      session.tenantId,
      sessionId,
      "AI provider not configured — set ANTHROPIC_API_KEY to enable the scribe pipeline",
    );
    // eslint-disable-next-line no-console
    console.warn("[scribe-orchestrator] AI provider unavailable:", (err as Error).message);
    return;
  }

  try {
    const segments = await readSegments(admin, session.tenantId, sessionId);
    if (segments.length === 0) {
      await markSessionFailed(admin, session.tenantId, sessionId, "No transcript segments found");
      return;
    }

    const context = await readPatientContext(admin, session.tenantId, encounterId);

    // ---- Step 1: SOAP draft ---------------------------------------------
    const soapSvc = new SoapDraftServiceImpl({ provider });
    const generateReqId = await createAIRequest(admin, {
      tenantId: session.tenantId,
      userId: session.userId,
      surface: "scribe_generate",
      model: "claude-opus-4-7",
    });

    const soapResult = await soapSvc.generate(session, {
      sessionId,
      aiRequestId: generateReqId,
      segments,
      patientContextHints: {
        ageYears: context.ageYears ?? undefined,
        sexAtBirth: context.sexAtBirth ?? undefined,
        chiefComplaint: context.chiefComplaint ?? undefined,
        knownAllergies: context.knownAllergies,
        currentMedications: context.currentMedications,
      },
    });

    // Persist the draft JSON to ai_completions — getAIReviewContext reads
    // this via ai_scribe_sessions.generate_request_id → ai_completions.
    await writeCompletion(admin, {
      tenantId: session.tenantId,
      requestId: generateReqId,
      content: JSON.stringify(soapResult.draft),
      promptId: soapResult.promptId,
      promptVersion: soapResult.promptVersion,
      inputTokens: soapResult.tokensIn,
      outputTokens: soapResult.tokensOut,
      latencyMs: soapResult.latencyMs,
    });
    await completeAIRequest(admin, session.tenantId, generateReqId, {
      prompt_tokens: soapResult.tokensIn,
      cost_micros_usd: soapResult.costMicrosUsd,
    });

    await updateSession(admin, session.tenantId, sessionId, {
      status: "suggesting_codes",
      generate_request_id: generateReqId,
    });

    // ---- Step 2: Code suggestions ---------------------------------------
    const codesSvc = new CodeSuggestionServiceImpl({ provider });
    const suggestReqId = await createAIRequest(admin, {
      tenantId: session.tenantId,
      userId: session.userId,
      surface: "scribe_codes",
      model: process.env.AI_SCRIBE_CODES_MODEL ?? "claude-opus-4-7",
    });

    const codesResult = await codesSvc.suggest(session, {
      sessionId,
      aiRequestId: suggestReqId,
      draft: soapResult.draft,
      segments,
      patientContextHints: {
        ageYears: context.ageYears ?? undefined,
        sexAtBirth: context.sexAtBirth ?? undefined,
        chiefComplaint: context.chiefComplaint ?? undefined,
        knownAllergies: context.knownAllergies,
        currentMedications: context.currentMedications,
        activeProblemList: context.activeProblemList,
      },
      visitContext: {
        type: context.visitType ?? undefined,
        setting: context.visitSetting ?? undefined,
        isNewPatient: context.isNewPatient ?? undefined,
        durationMinutes: context.durationMinutes ?? undefined,
      },
      modelOverride: process.env.AI_SCRIBE_CODES_MODEL,
    });

    if (codesResult.codes.length > 0) {
      await insertCodeSuggestions(
        admin,
        session.tenantId,
        sessionId,
        encounterId,
        codesResult.codes,
      );
    }

    await completeAIRequest(admin, session.tenantId, suggestReqId, {
      prompt_tokens: codesResult.tokensIn,
      cost_micros_usd: codesResult.costMicrosUsd,
    });

    await updateSession(admin, session.tenantId, sessionId, {
      status: "awaiting_review",
      suggest_request_id: suggestReqId,
      total_cost_micros_usd: soapResult.costMicrosUsd + codesResult.costMicrosUsd,
      total_latency_ms: soapResult.latencyMs + codesResult.latencyMs,
    });

    await logEventBestEffort({
      tenantId: session.tenantId,
      actorId: session.userId,
      eventType: "ai.codes_suggested",
      targetTable: "ai_scribe_sessions",
      targetRowId: sessionId as string,
      details: {
        num_codes: codesResult.codes.length,
        warnings: codesResult.warnings.length,
        model: codesResult.promptId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markSessionFailed(admin, session.tenantId, sessionId, message);
    // eslint-disable-next-line no-console
    console.error("[scribe-orchestrator] pipeline failed:", message);
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function readSegments(
  admin: SupabaseAdminClient,
  tenantId: string,
  sessionId: AIScribeSessionId,
): Promise<readonly AIScribeTranscriptSegment[]> {
  const { data, error } = await admin
    .from("ai_scribe_transcript_segments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId as string)
    .order("sequence_index", { ascending: true });
  if (error) throw new Error(`readSegments: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as AIScribeTranscriptSegment["id"],
    tenantId: r.tenant_id as TenantId,
    sessionId: r.session_id as AIScribeSessionId,
    sequenceIndex: r.sequence_index,
    startMs: r.start_ms,
    endMs: r.end_ms,
    speaker: r.speaker,
    text: r.text,
    partial: r.partial,
    createdAt: r.created_at,
  }));
}

interface PipelineContext {
  ageYears: number | null;
  sexAtBirth: string | null;
  chiefComplaint: string | null;
  knownAllergies: readonly string[];
  currentMedications: readonly string[];
  activeProblemList: readonly string[];
  visitType: string | null;
  visitSetting: string | null;
  isNewPatient: boolean | null;
  durationMinutes: number | null;
}

async function readPatientContext(
  admin: SupabaseAdminClient,
  tenantId: string,
  encounterId: EncounterId,
): Promise<PipelineContext> {
  type EncounterJoin = WithRelation<
    Pick<Row<"encounters">, "id" | "patient_id" | "chief_complaint" | "start_at" | "end_at">,
    "patient",
    Pick<Row<"patients">, "id" | "date_of_birth" | "sex_at_birth"> | null
  >;

  const { data: encRaw } = await admin
    .from("encounters")
    .select(
      "id, patient_id, chief_complaint, start_at, end_at, patient:patient_id(id, date_of_birth, sex_at_birth)",
    )
    .eq("id", encounterId as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const enc = encRaw as EncounterJoin | null;
  if (!enc) {
    return {
      ageYears: null,
      sexAtBirth: null,
      chiefComplaint: null,
      knownAllergies: [],
      currentMedications: [],
      activeProblemList: [],
      visitType: null,
      visitSetting: null,
      isNewPatient: null,
      durationMinutes: null,
    };
  }

  const ageYears = computeAge(enc.patient?.date_of_birth ?? null);
  const durationMinutes = computeDurationMinutes(enc.start_at, enc.end_at ?? null);

  // These tables exist in the clinical domain but may be empty for the
  // encounter. Queries are best-effort — orchestrator should never block
  // on optional clinical context.
  const [allergiesRes, medsRes, problemsRes] = await Promise.all([
    admin
      .from("allergies")
      .select("substance")
      .eq("tenant_id", tenantId)
      .eq("patient_id", enc.patient_id)
      .is("deleted_at", null),
    admin
      .from("medications")
      .select("display_name")
      .eq("tenant_id", tenantId)
      .eq("patient_id", enc.patient_id)
      .is("deleted_at", null)
      .eq("status", "active"),
    admin
      .from("diagnosis_assignments")
      .select("description")
      .eq("tenant_id", tenantId)
      .eq("patient_id", enc.patient_id)
      .is("removed_at", null),
  ]);

  return {
    ageYears,
    sexAtBirth: enc.patient?.sex_at_birth ?? null,
    chiefComplaint: enc.chief_complaint ?? null,
    knownAllergies: extractStrings(allergiesRes.data, "substance"),
    currentMedications: extractStrings(medsRes.data, "display_name"),
    activeProblemList: extractStrings(problemsRes.data, "description"),
    visitType: null,
    visitSetting: null,
    isNewPatient: null,
    durationMinutes,
  };
}

function extractStrings(data: unknown, field: string): readonly string[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((r) => (r as Record<string, unknown>)[field])
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

function computeAge(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function computeDurationMinutes(start: string, end: string | null): number | null {
  if (!end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
  return Math.round((e - s) / 60_000);
}

async function createAIRequest(
  admin: SupabaseAdminClient,
  params: {
    tenantId: string;
    userId: UserId;
    surface: string;
    model: string;
  },
): Promise<string> {
  const id = randomUUID();
  const row: Insert<"ai_requests"> = {
    id,
    tenant_id: params.tenantId,
    user_id: params.userId as string,
    surface: params.surface,
    provider: "anthropic",
    model: params.model,
    status: "streaming",
    prompt_hash: `scribe-${id.slice(0, 16)}`,
  };
  const { error } = await admin.from("ai_requests").insert(row);
  if (error) throw new Error(`createAIRequest: ${error.message}`);
  return id;
}

async function completeAIRequest(
  admin: SupabaseAdminClient,
  tenantId: string,
  id: string,
  patch: { prompt_tokens?: number; cost_micros_usd?: number },
): Promise<void> {
  await admin
    .from("ai_requests")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      prompt_tokens: patch.prompt_tokens ?? null,
      cost_micros_usd: patch.cost_micros_usd ?? null,
    })
    .eq("tenant_id", tenantId)
    .eq("id", id);
}

async function writeCompletion(
  admin: SupabaseAdminClient,
  params: {
    tenantId: string;
    requestId: string;
    content: string;
    promptId: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  },
): Promise<void> {
  const row: Insert<"ai_completions"> = {
    tenant_id: params.tenantId,
    request_id: params.requestId,
    content: params.content,
    completion_tokens: params.outputTokens,
    total_tokens: params.inputTokens + params.outputTokens,
    latency_ms: params.latencyMs,
    prompt_id: params.promptId,
    prompt_version: params.promptVersion,
  };
  const { error } = await admin.from("ai_completions").insert(row);
  if (error) throw new Error(`writeCompletion: ${error.message}`);
}

async function insertCodeSuggestions(
  admin: SupabaseAdminClient,
  tenantId: string,
  sessionId: AIScribeSessionId,
  encounterId: EncounterId,
  codes: Awaited<ReturnType<CodeSuggestionServiceImpl["suggest"]>>["codes"],
): Promise<void> {
  const rows: Insert<"ai_scribe_code_suggestions">[] = codes.map((c) => ({
    tenant_id: tenantId,
    session_id: sessionId as string,
    encounter_id: encounterId as string,
    type: c.type,
    code_system: c.codeSystem,
    code: c.code,
    description: c.description,
    rationale: c.rationale,
    missing_documentation: [...c.missingDocumentation],
    source: c.source,
    confidence: c.confidence as unknown as Insert<"ai_scribe_code_suggestions">["confidence"],
    rank: c.rank,
    segment_ids: [...c.segmentIds] as string[],
  }));
  const { error } = await admin.from("ai_scribe_code_suggestions").insert(rows);
  if (error) throw new Error(`insertCodeSuggestions: ${error.message}`);
}

async function updateSession(
  admin: SupabaseAdminClient,
  tenantId: string,
  sessionId: AIScribeSessionId,
  patch: {
    status: "generating" | "suggesting_codes" | "awaiting_review" | "failed";
    generate_request_id?: string;
    suggest_request_id?: string;
    total_cost_micros_usd?: number;
    total_latency_ms?: number;
    error_message?: string;
  },
): Promise<void> {
  const { error } = await admin
    .from("ai_scribe_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", sessionId as string);
  if (error) throw new Error(`updateSession: ${error.message}`);
}

async function markSessionFailed(
  admin: SupabaseAdminClient,
  tenantId: string,
  sessionId: AIScribeSessionId,
  message: string,
): Promise<void> {
  await updateSession(admin, tenantId, sessionId, {
    status: "failed",
    error_message: message.slice(0, 500),
  });
}

// ---------------------------------------------------------------------------
// Re-export helpers kept for local use
// ---------------------------------------------------------------------------

export type { PatientId };
