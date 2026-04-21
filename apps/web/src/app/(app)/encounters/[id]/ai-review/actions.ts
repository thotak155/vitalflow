"use server";

import { randomUUID } from "node:crypto";

import { createVitalFlowAdminClient } from "@vitalflow/auth/admin";
import { logEventBestEffort } from "@vitalflow/auth/audit";
import { requirePermission } from "@vitalflow/auth/rbac";
import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import type { AIScribeSessionId, EncounterId } from "@vitalflow/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { orchestrateScribePipeline } from "../../../../../lib/scribe-orchestrator.js";
import { getSession } from "../../../../../lib/session.js";

/**
 * Server Actions for the AI Review card. Mirrors the REST surface in
 * `/api/v1/ai/scribe/sessions/...` but is the UI's primary interaction path.
 * Matches the workspace pattern: all actions use POST-redirect-GET with
 * `?ok=...` or `?error=...` query params the page reads to render a banner.
 *
 * The SOAP + code-suggestion pipeline is NOT run here — that is the
 * orchestrator's job (a future PR). These actions only:
 *   - create / cancel sessions
 *   - submit transcript paste (chunked inline) or record an audio storage path
 *   - accept a review into encounter_notes + diagnosis_assignments
 *   - reject a review into ai_feedback
 *
 * Where the orchestrator needs to hook in, look for `// TODO(orchestrator):`.
 */

type RedirectError = { query: string };
function redirectBackToEncounter(encounterId: string, query: string): never {
  redirect(`/encounters/${encounterId}?${query}`);
}

function redirectOk(encounterId: string, message: string): never {
  redirectBackToEncounter(encounterId, `ok=${encodeURIComponent(message)}`);
}

function redirectError(encounterId: string, message: string): never {
  redirectBackToEncounter(encounterId, `error=${encodeURIComponent(message)}`);
}

// ---------------------------------------------------------------------------
// 1. startSession
// ---------------------------------------------------------------------------

export async function startScribeSession(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "ai:invoke");

  const encounterId = String(formData.get("encounter_id") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

  if (!encounterId || !/^[0-9a-f-]{36}$/i.test(encounterId)) {
    redirect(`/encounters?error=${encodeURIComponent("Missing encounter id")}`);
  }
  if (source !== "audio_upload" && source !== "transcript_paste") {
    redirectError(encounterId, "Invalid source for AI scribe session");
  }

  const supabase = await createVitalFlowServerClient();

  // Verify the encounter belongs to this tenant and grab patient id.
  const { data: enc } = await supabase
    .from("encounters")
    .select("id, patient_id, tenant_id")
    .eq("id", encounterId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (!enc) redirectError(encounterId, "Encounter not found");

  const admin = createVitalFlowAdminClient();
  const sessionId = randomUUID();

  const insertRow = {
    id: sessionId,
    tenant_id: session.tenantId,
    encounter_id: encounterId,
    patient_id: (enc as { patient_id: string }).patient_id,
    created_by: session.userId,
    source,
    status: "pending",
    metadata: {},
  };

  const { error } = await (
    admin as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from("ai_scribe_sessions")
    .insert(insertRow);
  if (error) redirectError(encounterId, `Failed to start session: ${error.message}`);

  await logEventBestEffort({
    tenantId: session.tenantId,
    actorId: session.userId,
    eventType: "ai.scribe_session_created",
    targetTable: "ai_scribe_sessions",
    targetRowId: sessionId,
    details: { encounter_id: encounterId, source },
  });

  revalidatePath(`/encounters/${encounterId}`);
  redirectOk(encounterId, "AI scribe session started");
}

// ---------------------------------------------------------------------------
// 2. submitTranscript  (paste path only; audio path deferred to orchestrator)
// ---------------------------------------------------------------------------

export async function submitTranscript(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "ai:invoke");

  const encounterId = String(formData.get("encounter_id") ?? "").trim();
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();

  if (!encounterId || !sessionId) {
    redirectError(encounterId, "Missing encounter or session id");
  }
  if (text.length < 10 || text.length > 200_000) {
    redirectError(encounterId, "Transcript must be between 10 and 200,000 characters");
  }

  const admin = createVitalFlowAdminClient();

  // Session must exist, belong to this tenant, and be in state 'pending'.
  const { data: scribeRow } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            a: string,
            b: string,
          ) => {
            eq: (
              a: string,
              b: string,
            ) => {
              maybeSingle: () => Promise<{
                data: { status: string; source: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    }
  )
    .from("ai_scribe_sessions")
    .select("status, source")
    .eq("id", sessionId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  if (!scribeRow) redirectError(encounterId, "Session not found");
  if (scribeRow.status !== "pending") {
    redirectError(
      encounterId,
      `Session is in state '${scribeRow.status}'; transcript already submitted`,
    );
  }

  // Chunk text into segments. Simple heuristic: split on blank lines, then
  // break long paragraphs on sentence boundaries at ~200 words.
  const segments = chunkTranscriptText(text);

  const rows = segments.map((segText, idx) => ({
    id: randomUUID(),
    tenant_id: session.tenantId,
    session_id: sessionId,
    sequence_index: idx,
    text: segText,
    partial: false,
  }));

  const { error: insertErr } = await (
    admin as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from("ai_scribe_transcript_segments")
    .insert(rows);

  if (insertErr) redirectError(encounterId, `Failed to save transcript: ${insertErr.message}`);

  // Move session to 'generating' so state B renders; the orchestrator will
  // advance to 'suggesting_codes' and then 'awaiting_review' once the SOAP +
  // codes pipelines complete. For the scaffold, we stop here.
  await (
    admin as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (
            a: string,
            b: string,
          ) => {
            eq: (a: string, b: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from("ai_scribe_sessions")
    .update({ status: "generating", updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", session.tenantId);

  await logEventBestEffort({
    tenantId: session.tenantId,
    actorId: session.userId,
    eventType: "ai.transcript_submitted",
    targetTable: "ai_scribe_sessions",
    targetRowId: sessionId,
    details: { source: scribeRow.source, segment_count: rows.length, byte_size: text.length },
  });

  // Run the SOAP + code-suggestion pipeline inline. Any failure inside the
  // orchestrator is captured and stored on `ai_scribe_sessions.error_message`
  // with status = 'failed'; the function never rethrows. See
  // scribe-orchestrator.ts for details.
  await orchestrateScribePipeline({
    sessionId: sessionId as AIScribeSessionId,
    encounterId: encounterId as EncounterId,
    session,
  });

  revalidatePath(`/encounters/${encounterId}`);
  redirectOk(encounterId, "Transcript submitted");
}

function chunkTranscriptText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments: string[] = [];
  for (const p of paragraphs) {
    if (countWords(p) <= 200) {
      segments.push(p);
      continue;
    }
    // Long paragraph: split on sentence-ish boundaries into ≤200-word chunks.
    const sentences = p.split(/(?<=[.!?])\s+/);
    let buf: string[] = [];
    let wc = 0;
    for (const s of sentences) {
      const w = countWords(s);
      if (wc + w > 200 && buf.length > 0) {
        segments.push(buf.join(" "));
        buf = [];
        wc = 0;
      }
      buf.push(s);
      wc += w;
    }
    if (buf.length > 0) segments.push(buf.join(" "));
  }
  return segments.filter((s) => s.length > 0);
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// 3. acceptDraft
// ---------------------------------------------------------------------------

export async function acceptDraft(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "ai:invoke");
  requirePermission(session, "clinical:write");

  if (session.impersonation) {
    redirectError(
      String(formData.get("encounter_id") ?? ""),
      "Cannot accept AI drafts while impersonating",
    );
  }

  const encounterId = String(formData.get("encounter_id") ?? "").trim();
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const patientId = String(formData.get("patient_id") ?? "").trim();
  const subjective = String(formData.get("subjective") ?? "");
  const objective = String(formData.get("objective") ?? "");
  const assessment = String(formData.get("assessment") ?? "");
  const plan = String(formData.get("plan") ?? "");
  const acceptedCodeIds = formData
    .getAll("accepted_code_id")
    .map((x) => String(x))
    .filter(Boolean);

  if (!encounterId || !sessionId || !patientId) {
    redirectError(encounterId, "Missing ids for accept");
  }

  const hasContent = [subjective, objective, assessment, plan].some(
    (s) => s.trim() && s.trim() !== "Not documented.",
  );
  if (!hasContent) redirectError(encounterId, "empty_draft");

  if (acceptedCodeIds.length > 30) {
    redirectError(encounterId, "Cannot accept more than 30 codes at once");
  }

  const admin = createVitalFlowAdminClient();

  // Verify session + encounter match tenant; pull the generate_request_id so
  // we can wire encounter_notes.ai_request_id.
  const { data: scribeRow } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            a: string,
            b: string,
          ) => {
            eq: (
              a: string,
              b: string,
            ) => {
              maybeSingle: () => Promise<{
                data: { status: string; generate_request_id: string | null } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    }
  )
    .from("ai_scribe_sessions")
    .select("status, generate_request_id")
    .eq("id", sessionId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  if (!scribeRow) redirectError(encounterId, "Session not found");
  if (scribeRow.status !== "awaiting_review") {
    redirectError(encounterId, `Session not ready for accept (status=${scribeRow.status})`);
  }

  // Refuse if the current note on this encounter is already signed.
  const { data: currentNote } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            a: string,
            b: string,
          ) => {
            eq: (
              a: string,
              b: string,
            ) => {
              neq: (
                a: string,
                b: string,
              ) => {
                order: (
                  a: string,
                  opts: { ascending: boolean },
                ) => {
                  limit: (n: number) => {
                    maybeSingle: () => Promise<{
                      data: { id: string; status: string; version: number } | null;
                      error: { message: string } | null;
                    }>;
                  };
                };
              };
            };
          };
        };
      };
    }
  )
    .from("encounter_notes")
    .select("id, status, version")
    .eq("encounter_id", encounterId)
    .eq("tenant_id", session.tenantId)
    .neq("status", "amended")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentNote?.status === "signed") {
    redirectError(encounterId, "encounter_signed");
  }

  const nextVersion = (currentNote?.version ?? 0) + 1;

  const newNoteId = randomUUID();
  const { error: noteErr } = await (
    admin as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from("encounter_notes")
    .insert({
      id: newNoteId,
      tenant_id: session.tenantId,
      encounter_id: encounterId,
      patient_id: patientId,
      author_id: session.userId,
      type: "soap",
      status: "draft",
      subjective: subjective || null,
      objective: objective || null,
      assessment: assessment || null,
      plan: plan || null,
      ai_assisted: true,
      ai_request_id: scribeRow.generate_request_id,
      version: nextVersion,
    });
  if (noteErr) redirectError(encounterId, `Failed to insert note: ${noteErr.message}`);

  let acceptedCount = 0;
  let acceptedIcd = 0;

  if (acceptedCodeIds.length > 0) {
    const { data: codeRows, error: codesErr } = await (
      admin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (
              col: string,
              vals: string[],
            ) => {
              eq: (
                a: string,
                b: string,
              ) => {
                eq: (
                  a: string,
                  b: string,
                ) => Promise<{
                  data:
                    | {
                        id: string;
                        code_system: string;
                        code: string;
                        description: string;
                        rank: number;
                      }[]
                    | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      }
    )
      .from("ai_scribe_code_suggestions")
      .select("id, code_system, code, description, rank")
      .in("id", acceptedCodeIds)
      .eq("session_id", sessionId)
      .eq("tenant_id", session.tenantId);

    if (codesErr) {
      redirectError(encounterId, `Failed to read accepted codes: ${codesErr.message}`);
    }
    const codes = codeRows ?? [];

    // Mark accepted.
    const now = new Date().toISOString();
    for (const c of codes) {
      await (
        admin as unknown as {
          from: (t: string) => {
            update: (v: Record<string, unknown>) => {
              eq: (
                a: string,
                b: string,
              ) => {
                eq: (a: string, b: string) => Promise<{ error: { message: string } | null }>;
              };
            };
          };
        }
      )
        .from("ai_scribe_code_suggestions")
        .update({ accepted_at: now, accepted_by: session.userId })
        .eq("id", c.id)
        .eq("tenant_id", session.tenantId);
    }
    acceptedCount = codes.length;

    // Materialize ICD-10 codes as diagnosis_assignments.
    const icdCodes = codes.filter((c) => c.code_system === "icd10-cm").slice(0, 12); // table caps rank at 12
    if (icdCodes.length > 0) {
      const assignmentRows = icdCodes.map((c, i) => ({
        id: randomUUID(),
        tenant_id: session.tenantId,
        patient_id: patientId,
        encounter_id: encounterId,
        code_system: "icd10-cm",
        code: c.code,
        description: c.description,
        rank: i + 1,
        assigned_by: session.userId,
      }));
      const { error: daErr } = await (
        admin as unknown as {
          from: (t: string) => {
            insert: (
              v: Record<string, unknown>[],
            ) => Promise<{ error: { message: string } | null }>;
          };
        }
      )
        .from("diagnosis_assignments")
        .insert(assignmentRows);
      if (daErr) {
        // Non-fatal — note was saved; log and continue.
        console.warn("Failed to materialize diagnosis_assignments:", daErr.message);
      } else {
        acceptedIcd = icdCodes.length;
      }
    }
  }

  // Transition session → accepted.
  await (
    admin as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (
            a: string,
            b: string,
          ) => {
            eq: (a: string, b: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from("ai_scribe_sessions")
    .update({
      status: "accepted",
      accepted_note_id: newNoteId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("tenant_id", session.tenantId);

  await logEventBestEffort({
    tenantId: session.tenantId,
    actorId: session.userId,
    eventType: "ai.draft_accepted",
    targetTable: "ai_scribe_sessions",
    targetRowId: sessionId,
    details: {
      note_id: newNoteId,
      note_version: nextVersion,
      accepted_code_count: acceptedCount,
      accepted_icd_assignments: acceptedIcd,
      edits_bytes: subjective.length + objective.length + assessment.length + plan.length,
    },
  });

  revalidatePath(`/encounters/${encounterId}`);
  redirectOk(
    encounterId,
    acceptedCount > 0
      ? `AI draft accepted into note v${nextVersion}; ${acceptedCount} codes added`
      : `AI draft accepted into note v${nextVersion}`,
  );
}

// ---------------------------------------------------------------------------
// 4. rejectDraft
// ---------------------------------------------------------------------------

export async function rejectDraft(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "ai:invoke");

  const encounterId = String(formData.get("encounter_id") ?? "").trim();
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const correction = String(formData.get("correction") ?? "").trim();

  if (!encounterId || !sessionId) redirectError(encounterId, "Missing ids for reject");
  if (reason.length < 5)
    redirectError(encounterId, "Rejection reason must be at least 5 characters");
  if (reason.length > 1000) redirectError(encounterId, "Rejection reason too long");
  if (correction.length > 5000) redirectError(encounterId, "Correction too long");

  const admin = createVitalFlowAdminClient();

  const { data: scribeRow } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            a: string,
            b: string,
          ) => {
            eq: (
              a: string,
              b: string,
            ) => {
              maybeSingle: () => Promise<{
                data: { status: string; generate_request_id: string | null } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    }
  )
    .from("ai_scribe_sessions")
    .select("status, generate_request_id")
    .eq("id", sessionId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  if (!scribeRow) redirectError(encounterId, "Session not found");
  if (scribeRow.status === "rejected") {
    redirectError(encounterId, "Session already rejected");
  }
  if (scribeRow.status !== "awaiting_review") {
    redirectError(encounterId, `Session not in reviewable state (status=${scribeRow.status})`);
  }

  if (scribeRow.generate_request_id) {
    await (
      admin as unknown as {
        from: (t: string) => {
          insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .from("ai_feedback")
      .insert({
        id: randomUUID(),
        tenant_id: session.tenantId,
        request_id: scribeRow.generate_request_id,
        user_id: session.userId,
        rating: -1,
        comment: reason,
        correction: correction || null,
      });
  }

  await (
    admin as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (
            a: string,
            b: string,
          ) => {
            eq: (a: string, b: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from("ai_scribe_sessions")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", session.tenantId);

  await logEventBestEffort({
    tenantId: session.tenantId,
    actorId: session.userId,
    eventType: "ai.draft_rejected",
    targetTable: "ai_scribe_sessions",
    targetRowId: sessionId,
    details: {
      reason_length: reason.length,
      correction_present: correction.length > 0,
    },
  });

  revalidatePath(`/encounters/${encounterId}`);
  redirectOk(encounterId, "AI draft rejected — feedback recorded");
}

// ---------------------------------------------------------------------------
// 5. cancelSession
// ---------------------------------------------------------------------------

export async function cancelScribeSession(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "ai:invoke");

  const encounterId = String(formData.get("encounter_id") ?? "").trim();
  const sessionId = String(formData.get("session_id") ?? "").trim();
  if (!encounterId || !sessionId) redirectError(encounterId, "Missing ids for cancel");

  const admin = createVitalFlowAdminClient();

  const { error } = await (
    admin as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (
            a: string,
            b: string,
          ) => {
            eq: (a: string, b: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from("ai_scribe_sessions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", session.tenantId);

  if (error) redirectError(encounterId, `Failed to cancel: ${error.message}`);

  revalidatePath(`/encounters/${encounterId}`);
  redirectOk(encounterId, "AI scribe session cancelled");
}

// ---------------------------------------------------------------------------
// 6. refresh — no-op action that just revalidates
// ---------------------------------------------------------------------------

export async function refreshAIReview(formData: FormData): Promise<void> {
  const encounterId = String(formData.get("encounter_id") ?? "").trim();
  revalidatePath(`/encounters/${encounterId}`);
  redirect(`/encounters/${encounterId}`);
}

// Silence TS6133 for the unused type alias — kept only for readability of redirect helpers.
type _Unused = RedirectError;
void (null as unknown as _Unused);
