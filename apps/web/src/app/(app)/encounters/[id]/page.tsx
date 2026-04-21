import { createHash } from "node:crypto";

import { createVitalFlowAdminClient } from "@vitalflow/auth/admin";
import { logEventBestEffort } from "@vitalflow/auth/audit";
import { requirePermission } from "@vitalflow/auth/rbac";
import { createVitalFlowServerClient, type SupabaseServerClient } from "@vitalflow/auth/server";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@vitalflow/ui";
import { AlertCircle, CheckCircle2 } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSession } from "../../../../lib/session.js";
import { AIReviewCard } from "./ai-review/AIReviewCard.js";
import { ChargeCaptureCard } from "./charge-capture/ChargeCaptureCard.js";

export const dynamic = "force-dynamic";

type EncounterRow = {
  id: string;
  patient_id: string;
  provider_id: string;
  status: string;
  start_at: string;
  end_at: string | null;
  reason: string | null;
  chief_complaint: string | null;
  patient: { given_name: string; family_name: string; mrn: string; date_of_birth: string } | null;
  provider: { full_name: string | null; email: string } | null;
};

type DiagnosisRow = {
  id: string;
  code_system: string;
  code: string;
  description: string;
  rank: number;
  pointer: string | null;
  assigned_at: string;
};

type AllergyRow = {
  id: string;
  type: string;
  substance: string;
  reaction: string | null;
  severity: string | null;
  notes: string | null;
  onset_date: string | null;
  created_at: string;
};

type MedicationRow = {
  id: string;
  display_name: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

type DocumentRow = {
  id: string;
  label: string | null;
  kind: string;
  source: string;
  mime_type: string;
  size_bytes: number;
  signed_by: string | null;
  signed_at: string | null;
  effective_date: string | null;
  created_at: string;
  uploaded_by: string | null;
};

type AuditEventRow = {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  action: string;
  event_type: string | null;
  row_id: string | null;
  details: Record<string, unknown> | null;
};

type NoteRow = {
  id: string;
  encounter_id: string;
  patient_id: string;
  author_id: string;
  type: string;
  status: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  signed_by: string | null;
  signed_at: string | null;
  version: number;
  updated_at: string;
  amended_from: string | null;
};

type VitalsRow = {
  id: string;
  recorded_at: string;
  recorded_by: string | null;
  systolic_mmhg: number | null;
  diastolic_mmhg: number | null;
  heart_rate_bpm: number | null;
  respiratory_rate: number | null;
  temperature_c: string | null;
  spo2_pct: number | null;
  weight_kg: string | null;
  height_cm: string | null;
  pain_score: number | null;
  notes: string | null;
};

const STATUS_VARIANTS: Record<string, "muted" | "success" | "warning" | "destructive" | "default"> =
  {
    planned: "default",
    arrived: "warning",
    in_progress: "warning",
    finished: "success",
    cancelled: "destructive",
  };

const NOTE_STATUS_VARIANTS: Record<
  string,
  "muted" | "success" | "warning" | "destructive" | "default"
> = {
  draft: "warning",
  pending_review: "warning",
  signed: "success",
  amended: "muted",
};

// Narrow writes to side-step missing `Database` shape inference.
type WritableTable<TSel extends string = "id"> = {
  insert: (v: Record<string, unknown>) => {
    select: (s: string) => {
      single: () => Promise<{
        data: Record<TSel, string> | null;
        error: { message: string } | null;
      }>;
    };
  };
  update: (v: Record<string, unknown>) => {
    eq: (
      c: string,
      v: string,
    ) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};
function tbl(c: SupabaseServerClient, name: string): WritableTable {
  return (c as unknown as { from: (t: string) => WritableTable }).from(name);
}

function computeNoteHash(input: {
  id: string;
  version: number;
  signerId: string;
  signedAt: string;
  content: string;
}): string {
  return createHash("sha256")
    .update(`${input.id}|${input.version}|${input.signerId}|${input.signedAt}|${input.content}`)
    .digest("hex");
}

function calcAge(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }
  return age;
}

async function updateEncounter(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "clinical:write");

  const id = String(formData.get("id") ?? "");
  const nextStatus = String(formData.get("status") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const chiefComplaint = String(formData.get("chief_complaint") ?? "").trim();
  if (!id) {
    redirect(`/encounters?error=${encodeURIComponent("Missing encounter id")}`);
  }

  const payload: Record<string, unknown> = {
    reason: reason || null,
    chief_complaint: chiefComplaint || null,
  };
  if (nextStatus) {
    payload.status = nextStatus;
    if (nextStatus === "finished") {
      payload.end_at = new Date().toISOString();
    }
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await tbl(supabase, "encounters")
    .update(payload)
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/encounters/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/encounters/${id}`);
  redirect(`/encounters/${id}?ok=${encodeURIComponent("Encounter updated")}`);
}

async function saveNoteDraft(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "clinical:write");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const noteId = String(formData.get("note_id") ?? "");
  const patientId = String(formData.get("patient_id") ?? "");
  const subjective = String(formData.get("subjective") ?? "");
  const objective = String(formData.get("objective") ?? "");
  const assessment = String(formData.get("assessment") ?? "");
  const plan = String(formData.get("plan") ?? "");

  if (!encounterId || !patientId) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent("Missing encounter or patient")}`,
    );
  }

  const supabase = await createVitalFlowServerClient();

  if (noteId) {
    const { error } = await tbl(supabase, "encounter_notes")
      .update({
        subjective: subjective || null,
        objective: objective || null,
        assessment: assessment || null,
        plan: plan || null,
      })
      .eq("id", noteId)
      .eq("tenant_id", session.tenantId);
    if (error) {
      redirect(`/encounters/${encounterId}?error=${encodeURIComponent(error.message)}`);
    }
  } else {
    const { error } = await tbl(supabase, "encounter_notes")
      .insert({
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
      })
      .select("id")
      .single();
    if (error) {
      redirect(`/encounters/${encounterId}?error=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirect(`/encounters/${encounterId}?ok=${encodeURIComponent("Note saved")}`);
}

async function signNote(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "clinical:sign");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const noteId = String(formData.get("note_id") ?? "");
  const attestation = String(formData.get("attestation") ?? "").trim();
  if (!noteId) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent("Save the draft before signing")}`,
    );
  }

  const supabase = await createVitalFlowServerClient();

  // Re-fetch note content to compute a hash of the exact content being attested to.
  const { data: noteRaw } = await supabase
    .from("encounter_notes")
    .select("id, version, subjective, objective, assessment, plan, status")
    .eq("id", noteId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  const note = noteRaw as {
    id: string;
    version: number;
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
    status: string;
  } | null;
  if (!note) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent("Note not found")}`);
  }
  if (note.status === "signed") {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent("Note already signed — use amend to modify")}`,
    );
  }

  const signedAt = new Date().toISOString();
  const content = [note.subjective, note.objective, note.assessment, note.plan]
    .map((s) => s ?? "")
    .join("\n---\n");
  const hash = computeNoteHash({
    id: note.id,
    version: note.version,
    signerId: session.userId,
    signedAt,
    content,
  });

  // Insert the signature, then flip the note to signed. Both writes share the
  // same tx via Supabase's RLS-safe calls; if either fails, the audit trigger
  // ensures we know. Not atomic on failure — a follow-up RPC wraps both.
  const { error: sigErr } = await tbl(supabase, "signatures")
    .insert({
      tenant_id: session.tenantId,
      signer_id: session.userId,
      subject_schema: "public",
      subject_table: "encounter_notes",
      subject_id: note.id,
      attestation: attestation || "Reviewed and attested to by signer.",
      signed_at: signedAt,
      hash,
    })
    .select("id")
    .single();
  if (sigErr) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent(`Signature failed: ${sigErr.message}`)}`,
    );
  }

  const { error: noteErr } = await tbl(supabase, "encounter_notes")
    .update({
      status: "signed",
      signed_by: session.userId,
      signed_at: signedAt,
    })
    .eq("id", note.id)
    .eq("tenant_id", session.tenantId);
  if (noteErr) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent(`Sign failed: ${noteErr.message}`)}`,
    );
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirect(`/encounters/${encounterId}?ok=${encodeURIComponent("Note signed")}`);
}

async function assignDiagnosis(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "clinical:write");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const patientId = String(formData.get("patient_id") ?? "");
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  const description = String(formData.get("description") ?? "").trim();

  if (!encounterId || !patientId || !code || !description) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent("Code and description are required")}`,
    );
  }
  if (!/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/.test(code)) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent(
        "ICD-10 code format looks off (e.g. E11.9, J45.40)",
      )}`,
    );
  }

  const supabase = await createVitalFlowServerClient();

  // Compute next rank = max(rank)+1 among active assignments.
  const { data: maxRaw } = await supabase
    .from("diagnosis_assignments")
    .select("rank")
    .eq("encounter_id", encounterId)
    .eq("tenant_id", session.tenantId)
    .is("removed_at", null)
    .order("rank", { ascending: false })
    .limit(1)
    .maybeSingle();
  const maxRow = maxRaw as { rank: number } | null;
  const nextRank = (maxRow?.rank ?? 0) + 1;
  if (nextRank > 12) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent(
        "Max 12 active diagnoses per encounter",
      )}`,
    );
  }

  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from("diagnosis_assignments")
    .insert({
      tenant_id: session.tenantId,
      patient_id: patientId,
      encounter_id: encounterId,
      code_system: "icd10-cm",
      code,
      description,
      rank: nextRank,
      assigned_by: session.userId,
    });
  if (error) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirect(
    `/encounters/${encounterId}?ok=${encodeURIComponent(`Added ${code} at rank ${nextRank}`)}`,
  );
}

async function removeDiagnosis(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "clinical:write");

  const id = String(formData.get("id") ?? "");
  const encounterId = String(formData.get("encounter_id") ?? "");
  if (!id || !encounterId) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent("Missing diagnosis id")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (
            c: string,
            v: string,
          ) => {
            eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from("diagnosis_assignments")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirect(`/encounters/${encounterId}?ok=${encodeURIComponent("Diagnosis removed")}`);
}

async function addAllergy(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "patient:write");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const patientId = String(formData.get("patient_id") ?? "");
  const type = String(formData.get("type") ?? "");
  const substance = String(formData.get("substance") ?? "").trim();
  const reaction = String(formData.get("reaction") ?? "").trim();
  const severity = String(formData.get("severity") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!patientId || !type || !substance) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent("Type and substance are required")}`,
    );
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from("allergies")
    .insert({
      tenant_id: session.tenantId,
      patient_id: patientId,
      type,
      substance,
      reaction: reaction || null,
      severity: severity || null,
      notes: notes || null,
      recorded_by: session.userId,
    });
  if (error) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirect(`/encounters/${encounterId}?ok=${encodeURIComponent("Allergy added")}`);
}

async function removeAllergy(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "patient:write");

  const id = String(formData.get("id") ?? "");
  const encounterId = String(formData.get("encounter_id") ?? "");
  if (!id || !encounterId) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent("Missing allergy id")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (
            c: string,
            v: string,
          ) => {
            eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from("allergies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirect(`/encounters/${encounterId}?ok=${encodeURIComponent("Allergy removed")}`);
}

async function addMedication(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "clinical:write");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const patientId = String(formData.get("patient_id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const dose = String(formData.get("dose") ?? "").trim();
  const route = String(formData.get("route") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();

  if (!patientId || !displayName) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent("Medication name is required")}`,
    );
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from("medications")
    .insert({
      tenant_id: session.tenantId,
      patient_id: patientId,
      display_name: displayName,
      dose: dose || null,
      route: route || null,
      frequency: frequency || null,
      status: "active",
      start_date: startDate || null,
      end_date: endDate || null,
      prescribing_provider_id: session.userId,
    });
  if (error) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirect(`/encounters/${encounterId}?ok=${encodeURIComponent("Medication added")}`);
}

async function setMedicationStatus(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "clinical:write");

  const id = String(formData.get("id") ?? "");
  const encounterId = String(formData.get("encounter_id") ?? "");
  const next = String(formData.get("status") ?? "").trim();
  const validNext = ["active", "on_hold", "completed", "stopped"];
  if (!id || !validNext.includes(next)) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent("Invalid status")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const payload: Record<string, unknown> = { status: next };
  if (next === "completed" || next === "stopped") {
    payload.end_date = new Date().toISOString().slice(0, 10);
  }
  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (
            c: string,
            v: string,
          ) => {
            eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from("medications")
    .update(payload)
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirect(
    `/encounters/${encounterId}?ok=${encodeURIComponent(`Medication marked ${next.replace(/_/g, " ")}`)}`,
  );
}

async function amendNote(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "clinical:amend");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const noteId = String(formData.get("note_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!noteId) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent("Missing note id")}`);
  }
  if (reason.length < 5) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent(
        "Amendment reason is required (5+ characters)",
      )}`,
    );
  }

  const supabase = await createVitalFlowServerClient();

  // Fetch the current note. Must be signed to be amendable.
  const { data: currentRaw } = await supabase
    .from("encounter_notes")
    .select(
      "id, encounter_id, patient_id, type, status, subjective, objective, assessment, plan, version",
    )
    .eq("id", noteId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  const current = currentRaw as {
    id: string;
    encounter_id: string;
    patient_id: string;
    type: string;
    status: string;
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
    version: number;
  } | null;
  if (!current) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent("Note not found")}`);
  }
  if (current.status !== "signed") {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent(
        "Only signed notes can be amended — drafts are editable in place",
      )}`,
    );
  }

  // Insert new draft that carries forward prior content. Not atomic with the
  // status flip below — an RPC wrapping both writes lands with the billing
  // work (same pattern as sign-note). Worst case on partial failure: a fresh
  // draft without the old note flipped to 'amended', caught on next render.
  const insertRes = await tbl(supabase, "encounter_notes")
    .insert({
      tenant_id: session.tenantId,
      encounter_id: current.encounter_id,
      patient_id: current.patient_id,
      author_id: session.userId,
      type: current.type,
      status: "draft",
      subjective: current.subjective,
      objective: current.objective,
      assessment: current.assessment,
      plan: current.plan,
      amended_from: current.id,
      version: current.version + 1,
    })
    .select("id")
    .single();
  if (insertRes.error || !insertRes.data) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent(
        insertRes.error?.message ?? "Failed to create amendment",
      )}`,
    );
  }

  const { error: flipErr } = await tbl(supabase, "encounter_notes")
    .update({ status: "amended" })
    .eq("id", current.id)
    .eq("tenant_id", session.tenantId);
  if (flipErr) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent(
        `Created v${current.version + 1} but failed to supersede v${current.version}: ${flipErr.message}`,
      )}`,
    );
  }

  // Emit the semantic audit event with the amendment reason. Row-level audit
  // trigger already captured the before/after diff for both rows.
  await logEventBestEffort({
    tenantId: session.tenantId,
    actorId: session.userId,
    eventType: "note.amended",
    targetTable: "encounter_notes",
    targetRowId: insertRes.data.id,
    details: {
      amended_from: current.id,
      from_version: current.version,
      to_version: current.version + 1,
      reason,
    },
  });

  revalidatePath(`/encounters/${encounterId}`);
  redirect(
    `/encounters/${encounterId}?ok=${encodeURIComponent(`Amended — v${current.version + 1} draft ready`)}`,
  );
}

async function recordVitals(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "patient:write");

  const encounterId = String(formData.get("encounter_id") ?? "");
  const patientId = String(formData.get("patient_id") ?? "");

  const toInt = (name: string): number | null => {
    const v = String(formData.get(name) ?? "").trim();
    if (!v) return null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const toNum = (name: string): number | null => {
    const v = String(formData.get(name) ?? "").trim();
    if (!v) return null;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const payload = {
    tenant_id: session.tenantId,
    patient_id: patientId,
    encounter_id: encounterId,
    recorded_by: session.userId,
    systolic_mmhg: toInt("systolic_mmhg"),
    diastolic_mmhg: toInt("diastolic_mmhg"),
    heart_rate_bpm: toInt("heart_rate_bpm"),
    respiratory_rate: toInt("respiratory_rate"),
    temperature_c: toNum("temperature_c"),
    spo2_pct: toInt("spo2_pct"),
    weight_kg: toNum("weight_kg"),
    height_cm: toNum("height_cm"),
    pain_score: toInt("pain_score"),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };

  const allEmpty = Object.entries(payload).every(
    ([k, v]) =>
      ["tenant_id", "patient_id", "encounter_id", "recorded_by"].includes(k) || v === null,
  );
  if (allEmpty) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent("Enter at least one vital sign")}`,
    );
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from("vitals")
    .insert(payload);
  if (error) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirect(`/encounters/${encounterId}?ok=${encodeURIComponent("Vitals recorded")}`);
}

export default async function EncounterWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; showLow?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "clinical:read");

  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createVitalFlowServerClient();

  const { data: encRaw } = await supabase
    .from("encounters")
    .select(
      "id, patient_id, provider_id, status, start_at, end_at, reason, chief_complaint, " +
        "patient:patient_id(given_name, family_name, mrn, date_of_birth), " +
        "provider:provider_id(full_name, email)",
    )
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  const encounter = encRaw as EncounterRow | null;

  if (!encounter) {
    notFound();
  }

  // Active note: latest version that is not yet superseded. After an amendment
  // the previous version is flipped to status='amended' and a new draft row is
  // inserted with `amended_from` pointing at it. The "tip" of the chain is the
  // only row whose status is NOT 'amended'.
  const { data: noteRaw } = await supabase
    .from("encounter_notes")
    .select(
      "id, encounter_id, patient_id, author_id, type, status, subjective, objective, assessment, plan, signed_by, signed_at, version, updated_at, amended_from",
    )
    .eq("encounter_id", id)
    .eq("tenant_id", session.tenantId)
    .neq("status", "amended")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const note = noteRaw as NoteRow | null;

  // Full history for the panel — every version including superseded ones.
  const { data: historyRaw } = await supabase
    .from("encounter_notes")
    .select(
      "id, version, status, author_id, signed_at, signed_by, amended_from, updated_at, " +
        "author:author_id(full_name, email)",
    )
    .eq("encounter_id", id)
    .eq("tenant_id", session.tenantId)
    .order("version", { ascending: false });
  const history = (historyRaw ?? []) as unknown as {
    id: string;
    version: number;
    status: string;
    author_id: string;
    signed_at: string | null;
    signed_by: string | null;
    amended_from: string | null;
    updated_at: string;
    author: { full_name: string | null; email: string } | null;
  }[];

  const { data: vitalsRaw } = await supabase
    .from("vitals")
    .select(
      "id, recorded_at, recorded_by, systolic_mmhg, diastolic_mmhg, heart_rate_bpm, respiratory_rate, temperature_c, spo2_pct, weight_kg, height_cm, pain_score, notes",
    )
    .eq("encounter_id", id)
    .eq("tenant_id", session.tenantId)
    .order("recorded_at", { ascending: false });
  const vitals = (vitalsRaw ?? []) as unknown as VitalsRow[];

  const { data: diagnosesRaw } = await supabase
    .from("diagnosis_assignments")
    .select("id, code_system, code, description, rank, pointer, assigned_at")
    .eq("encounter_id", id)
    .eq("tenant_id", session.tenantId)
    .is("removed_at", null)
    .order("rank", { ascending: true });
  const diagnoses = (diagnosesRaw ?? []) as unknown as DiagnosisRow[];

  const { data: allergiesRaw } = await supabase
    .from("allergies")
    .select("id, type, substance, reaction, severity, notes, onset_date, created_at")
    .eq("patient_id", encounter.patient_id)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const allergies = (allergiesRaw ?? []) as unknown as AllergyRow[];

  const { data: medicationsRaw } = await supabase
    .from("medications")
    .select("id, display_name, dose, route, frequency, status, start_date, end_date")
    .eq("patient_id", encounter.patient_id)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("status", { ascending: true })
    .order("start_date", { ascending: false });
  const medications = (medicationsRaw ?? []) as unknown as MedicationRow[];

  const { data: documentsRaw } = await supabase
    .from("attachments")
    .select(
      "id, label, kind, source, mime_type, size_bytes, signed_by, signed_at, effective_date, created_at, uploaded_by",
    )
    .eq("encounter_id", id)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const documents = (documentsRaw ?? []) as unknown as DocumentRow[];

  // Note audit trail — gated on audit:read. Uses the service-role admin client
  // because audit.audit_events has no authenticated-user SELECT policy in V1;
  // the permission check above is the authoritative gate.
  const canViewAudit = session.permissions.includes("audit:read");
  let auditEvents: AuditEventRow[] = [];
  if (canViewAudit) {
    // Fetch all version row ids for this encounter to filter audit events.
    const { data: noteIdsRaw } = await supabase
      .from("encounter_notes")
      .select("id")
      .eq("encounter_id", id)
      .eq("tenant_id", session.tenantId);
    const noteIds = ((noteIdsRaw ?? []) as unknown as { id: string }[]).map((r) => r.id);

    if (noteIds.length > 0) {
      const admin = createVitalFlowAdminClient();
      const { data: eventsRaw } = await (
        admin as unknown as {
          schema: (s: string) => {
            from: (t: string) => {
              select: (cols: string) => {
                eq: (
                  c: string,
                  v: string,
                ) => {
                  eq: (
                    c: string,
                    v: string,
                  ) => {
                    in: (
                      c: string,
                      v: readonly string[],
                    ) => {
                      order: (
                        c: string,
                        opts: { ascending: boolean },
                      ) => {
                        limit: (n: number) => Promise<{
                          data: AuditEventRow[] | null;
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
        .schema("audit")
        .from("audit_events")
        .select("id, occurred_at, actor_id, action, event_type, row_id, details")
        .eq("tenant_id", session.tenantId)
        .eq("table_name", "encounter_notes")
        .in("row_id", noteIds)
        .order("occurred_at", { ascending: false })
        .limit(20);
      auditEvents = eventsRaw ?? [];
    }
  }

  const displayName = encounter.patient
    ? `${encounter.patient.given_name} ${encounter.patient.family_name}`
    : "Encounter";

  const canWrite = session.permissions.includes("clinical:write");
  const canSign = session.permissions.includes("clinical:sign");
  const canAmend = session.permissions.includes("clinical:amend");
  const canRecordVitals = session.permissions.includes("patient:write");
  const noteSigned = note?.status === "signed";
  const noteIsAmendment = note?.amended_from !== null && note?.amended_from !== undefined;
  const encounterFinished = encounter.status === "finished" || encounter.status === "cancelled";

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[
          { label: "Home", href: "/" },
          { label: "Encounters", href: "/encounters" },
          { label: displayName },
        ]}
      />
      <PageHeader
        eyebrow="Encounter"
        title={displayName}
        description={
          <span className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
            {encounter.patient ? (
              <>
                <span className="font-mono">{encounter.patient.mrn}</span>
                <span>·</span>
                <span>
                  DOB {encounter.patient.date_of_birth} ({calcAge(encounter.patient.date_of_birth)}{" "}
                  y)
                </span>
                <span>·</span>
              </>
            ) : null}
            <span>{new Date(encounter.start_at).toLocaleString()}</span>
            <span>·</span>
            <span>{encounter.provider?.full_name ?? encounter.provider?.email ?? "—"}</span>
            <Badge variant={STATUS_VARIANTS[encounter.status] ?? "default"}>
              {encounter.status.replace(/_/g, " ")}
            </Badge>
          </span>
        }
        actions={
          encounter.patient ? (
            <Button asChild variant="outline">
              <NextLink href={`/patients/${encounter.patient_id}`}>Open chart</NextLink>
            </Button>
          ) : null
        }
      />

      {sp.ok ? (
        <div
          role="status"
          className="border-success/30 bg-success/5 mb-4 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{sp.ok}</span>
        </div>
      ) : null}
      {sp.error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 mb-4 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{sp.error}</span>
        </div>
      ) : null}

      <div className="grid gap-6">
        {/* Encounter header edit */}
        <Card>
          <CardHeader>
            <CardTitle>Visit summary</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite && !encounterFinished ? (
              <form action={updateEncounter} className="space-y-4">
                <input type="hidden" name="id" value={encounter.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Chief complaint" htmlFor="chief_complaint">
                    <Input
                      id="chief_complaint"
                      name="chief_complaint"
                      defaultValue={encounter.chief_complaint ?? ""}
                      placeholder="Cough, headache, follow-up…"
                    />
                  </FormField>
                  <FormField label="Status" htmlFor="status">
                    <select
                      id="status"
                      name="status"
                      defaultValue={encounter.status}
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                    >
                      <option value="planned">Planned</option>
                      <option value="arrived">Arrived</option>
                      <option value="in_progress">In progress</option>
                      <option value="finished">Finished</option>
                    </select>
                  </FormField>
                </div>
                <FormField label="Reason" htmlFor="reason">
                  <Textarea
                    id="reason"
                    name="reason"
                    rows={2}
                    defaultValue={encounter.reason ?? ""}
                  />
                </FormField>
                <Button type="submit">Save summary</Button>
              </form>
            ) : (
              <dl className="grid gap-2 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Chief complaint</dt>
                  <dd>{encounter.chief_complaint ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd>{encounter.reason ?? "—"}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Allergies — patient-scoped, visible near the top for safety */}
        <Card>
          <CardHeader>
            <CardTitle>Allergies ({allergies.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {allergies.length > 0 ? (
              <ul className="mb-4 divide-y text-sm">
                {allergies.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.substance}</span>
                        <Badge variant="muted">{a.type}</Badge>
                        {a.severity ? (
                          <Badge
                            variant={
                              a.severity === "life_threatening" || a.severity === "severe"
                                ? "destructive"
                                : a.severity === "moderate"
                                  ? "warning"
                                  : "muted"
                            }
                          >
                            {a.severity.replace(/_/g, " ")}
                          </Badge>
                        ) : null}
                      </div>
                      {a.reaction ? (
                        <div className="text-muted-foreground text-xs">Reaction: {a.reaction}</div>
                      ) : null}
                      {a.notes ? (
                        <div className="text-muted-foreground text-xs">{a.notes}</div>
                      ) : null}
                    </div>
                    {canWrite && !encounterFinished ? (
                      <form action={removeAllergy}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="encounter_id" value={encounter.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Remove
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mb-4 text-sm">
                No known allergies on file. Record any reactions the patient reports below.
              </p>
            )}

            {canWrite && !encounterFinished ? (
              <form
                action={addAllergy}
                className="border-border space-y-3 rounded-md border border-dashed p-4"
              >
                <input type="hidden" name="encounter_id" value={encounter.id} />
                <input type="hidden" name="patient_id" value={encounter.patient_id} />
                <div className="grid gap-3 md:grid-cols-4">
                  <FormField label="Type" htmlFor="allergy-type" required>
                    <select
                      id="allergy-type"
                      name="type"
                      required
                      defaultValue="medication"
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                    >
                      <option value="medication">Medication</option>
                      <option value="food">Food</option>
                      <option value="environmental">Environmental</option>
                      <option value="other">Other</option>
                    </select>
                  </FormField>
                  <FormField label="Substance" htmlFor="substance" required>
                    <Input id="substance" name="substance" required placeholder="Penicillin" />
                  </FormField>
                  <FormField label="Reaction" htmlFor="reaction">
                    <Input id="reaction" name="reaction" placeholder="Hives, swelling…" />
                  </FormField>
                  <FormField label="Severity" htmlFor="severity">
                    <select
                      id="severity"
                      name="severity"
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                    >
                      <option value="">—</option>
                      <option value="mild">Mild</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                      <option value="life_threatening">Life-threatening</option>
                    </select>
                  </FormField>
                </div>
                <FormField label="Notes" htmlFor="allergy-notes">
                  <Input id="allergy-notes" name="notes" placeholder="Optional" />
                </FormField>
                <Button type="submit">Add allergy</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        {/* Medications — patient-scoped, visible near the top for safety */}
        <Card>
          <CardHeader>
            <CardTitle>Medications ({medications.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {medications.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medication</TableHead>
                    <TableHead>Dose</TableHead>
                    <TableHead>Route / Freq</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medications.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.display_name}</TableCell>
                      <TableCell>{m.dose ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {[m.route, m.frequency].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {m.start_date ?? "—"}
                        {m.end_date ? ` → ${m.end_date}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            m.status === "active"
                              ? "success"
                              : m.status === "on_hold"
                                ? "warning"
                                : "muted"
                          }
                        >
                          {m.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canWrite && !encounterFinished && m.status === "active" ? (
                          <div className="flex justify-end gap-2">
                            <form action={setMedicationStatus}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="encounter_id" value={encounter.id} />
                              <input type="hidden" name="status" value="on_hold" />
                              <Button type="submit" size="sm" variant="outline">
                                Hold
                              </Button>
                            </form>
                            <form action={setMedicationStatus}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="encounter_id" value={encounter.id} />
                              <input type="hidden" name="status" value="stopped" />
                              <Button type="submit" size="sm" variant="outline">
                                Stop
                              </Button>
                            </form>
                          </div>
                        ) : canWrite && !encounterFinished && m.status === "on_hold" ? (
                          <form action={setMedicationStatus}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="encounter_id" value={encounter.id} />
                            <input type="hidden" name="status" value="active" />
                            <Button type="submit" size="sm" variant="outline">
                              Resume
                            </Button>
                          </form>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground mb-4 text-sm">No medications on file.</p>
            )}

            {canWrite && !encounterFinished ? (
              <form
                action={addMedication}
                className="border-border mt-4 space-y-3 rounded-md border border-dashed p-4"
              >
                <input type="hidden" name="encounter_id" value={encounter.id} />
                <input type="hidden" name="patient_id" value={encounter.patient_id} />
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="Medication" htmlFor="med-name" required>
                    <Input
                      id="med-name"
                      name="display_name"
                      required
                      placeholder="Metformin 500 mg tab"
                    />
                  </FormField>
                  <FormField label="Dose" htmlFor="med-dose">
                    <Input id="med-dose" name="dose" placeholder="500 mg" />
                  </FormField>
                  <FormField label="Route" htmlFor="med-route">
                    <Input id="med-route" name="route" placeholder="PO" />
                  </FormField>
                  <FormField label="Frequency" htmlFor="med-freq">
                    <Input id="med-freq" name="frequency" placeholder="BID with meals" />
                  </FormField>
                  <FormField label="Start date" htmlFor="med-start">
                    <Input id="med-start" name="start_date" type="date" />
                  </FormField>
                  <FormField label="End date" htmlFor="med-end">
                    <Input id="med-end" name="end_date" type="date" />
                  </FormField>
                </div>
                <Button type="submit">Add medication</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        {/* Diagnoses */}
        <Card>
          <CardHeader>
            <CardTitle>Diagnoses ({diagnoses.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {diagnoses.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead className="w-32">Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-40 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diagnoses.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.rank}</TableCell>
                      <TableCell className="font-mono text-xs">{d.code}</TableCell>
                      <TableCell>{d.description}</TableCell>
                      <TableCell className="text-right">
                        {canWrite && !encounterFinished ? (
                          <form action={removeDiagnosis} className="inline">
                            <input type="hidden" name="id" value={d.id} />
                            <input type="hidden" name="encounter_id" value={encounter.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Remove
                            </Button>
                          </form>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground mb-4 text-sm">
                No diagnoses assigned. Add at least one before signing the note for claim
                generation.
              </p>
            )}

            {canWrite && !encounterFinished ? (
              <form
                action={assignDiagnosis}
                className="border-border mt-4 space-y-3 rounded-md border border-dashed p-4"
              >
                <input type="hidden" name="encounter_id" value={encounter.id} />
                <input type="hidden" name="patient_id" value={encounter.patient_id} />
                <div className="grid gap-3 md:grid-cols-[160px,1fr,auto]">
                  <FormField label="ICD-10 code" htmlFor="code" required>
                    <Input
                      id="code"
                      name="code"
                      required
                      placeholder="E11.9"
                      className="font-mono"
                      autoComplete="off"
                    />
                  </FormField>
                  <FormField label="Description" htmlFor="description" required>
                    <Input
                      id="description"
                      name="description"
                      required
                      placeholder="Type 2 diabetes without complications"
                      autoComplete="off"
                    />
                  </FormField>
                  <div className="flex items-end">
                    <Button type="submit">Add</Button>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  Rank is assigned automatically (next available). Full ICD-10 dictionary lookup
                  ships with the billing surface — for now, type the code + description by hand.
                </p>
              </form>
            ) : null}
          </CardContent>
        </Card>

        {/* Vitals */}
        <Card>
          <CardHeader>
            <CardTitle>Vitals ({vitals.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {vitals.length > 0 ? (
              <ul className="mb-4 divide-y text-sm">
                {vitals.map((v) => (
                  <li key={v.id} className="py-2">
                    <div className="text-muted-foreground text-xs">
                      {new Date(v.recorded_at).toLocaleString()}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {v.systolic_mmhg && v.diastolic_mmhg ? (
                        <span>
                          BP {v.systolic_mmhg}/{v.diastolic_mmhg}
                        </span>
                      ) : null}
                      {v.heart_rate_bpm ? <span>HR {v.heart_rate_bpm}</span> : null}
                      {v.respiratory_rate ? <span>RR {v.respiratory_rate}</span> : null}
                      {v.temperature_c ? <span>Temp {v.temperature_c}°C</span> : null}
                      {v.spo2_pct ? <span>SpO₂ {v.spo2_pct}%</span> : null}
                      {v.weight_kg ? <span>Wt {v.weight_kg}kg</span> : null}
                      {v.height_cm ? <span>Ht {v.height_cm}cm</span> : null}
                      {v.pain_score !== null ? <span>Pain {v.pain_score}/10</span> : null}
                    </div>
                    {v.notes ? (
                      <div className="text-muted-foreground text-xs">{v.notes}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {canRecordVitals && !encounterFinished ? (
              <form
                action={recordVitals}
                className="border-border space-y-3 rounded-md border border-dashed p-4"
              >
                <input type="hidden" name="encounter_id" value={encounter.id} />
                <input type="hidden" name="patient_id" value={encounter.patient_id} />
                <div className="grid gap-3 md:grid-cols-4">
                  <FormField label="Systolic" htmlFor="systolic_mmhg">
                    <Input
                      id="systolic_mmhg"
                      name="systolic_mmhg"
                      type="number"
                      min={40}
                      max={300}
                    />
                  </FormField>
                  <FormField label="Diastolic" htmlFor="diastolic_mmhg">
                    <Input
                      id="diastolic_mmhg"
                      name="diastolic_mmhg"
                      type="number"
                      min={20}
                      max={200}
                    />
                  </FormField>
                  <FormField label="HR" htmlFor="heart_rate_bpm">
                    <Input
                      id="heart_rate_bpm"
                      name="heart_rate_bpm"
                      type="number"
                      min={20}
                      max={300}
                    />
                  </FormField>
                  <FormField label="RR" htmlFor="respiratory_rate">
                    <Input
                      id="respiratory_rate"
                      name="respiratory_rate"
                      type="number"
                      min={5}
                      max={60}
                    />
                  </FormField>
                  <FormField label="Temp (°C)" htmlFor="temperature_c">
                    <Input
                      id="temperature_c"
                      name="temperature_c"
                      type="number"
                      step="0.1"
                      min={30}
                      max={45}
                    />
                  </FormField>
                  <FormField label="SpO₂ (%)" htmlFor="spo2_pct">
                    <Input id="spo2_pct" name="spo2_pct" type="number" min={50} max={100} />
                  </FormField>
                  <FormField label="Weight (kg)" htmlFor="weight_kg">
                    <Input
                      id="weight_kg"
                      name="weight_kg"
                      type="number"
                      step="0.1"
                      min={0.5}
                      max={500}
                    />
                  </FormField>
                  <FormField label="Height (cm)" htmlFor="height_cm">
                    <Input
                      id="height_cm"
                      name="height_cm"
                      type="number"
                      step="0.1"
                      min={20}
                      max={250}
                    />
                  </FormField>
                  <FormField label="Pain (0–10)" htmlFor="pain_score">
                    <Input id="pain_score" name="pain_score" type="number" min={0} max={10} />
                  </FormField>
                </div>
                <FormField label="Notes" htmlFor="vitals_notes">
                  <Input id="vitals_notes" name="notes" placeholder="Optional comment" />
                </FormField>
                <Button type="submit">Record vitals</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        {/* Note (SOAP) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                Clinical note{" "}
                {note ? (
                  <Badge variant={NOTE_STATUS_VARIANTS[note.status] ?? "default"}>
                    {note.status}
                  </Badge>
                ) : null}
              </span>
              {note?.version ? (
                <span className="text-muted-foreground text-xs">v{note.version}</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {noteSigned && note ? (
              <>
                <div className="space-y-4 text-sm">
                  <p className="text-muted-foreground text-xs">
                    Signed {note.signed_at ? new Date(note.signed_at).toLocaleString() : ""} — use
                    Amend below to create a new version.
                  </p>
                  {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
                    <div key={k}>
                      <div className="text-muted-foreground text-xs font-medium uppercase">{k}</div>
                      <div className="border-input bg-muted/30 whitespace-pre-wrap rounded-md border p-3">
                        {note[k] ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>

                {canAmend ? (
                  <form
                    action={amendNote}
                    className="border-warning/30 bg-warning/5 mt-6 space-y-3 rounded-md border p-4"
                  >
                    <input type="hidden" name="encounter_id" value={encounter.id} />
                    <input type="hidden" name="note_id" value={note.id} />
                    <div className="text-sm font-medium">Amend this note</div>
                    <p className="text-muted-foreground text-xs">
                      Creates a new draft version (v{note.version + 1}) pre-filled with the current
                      content. The current version stays in the record as <code>amended</code>. A
                      reason is required and logged to the audit trail.
                    </p>
                    <FormField label="Reason for amendment" htmlFor="reason" required>
                      <Textarea
                        id="reason"
                        name="reason"
                        rows={2}
                        required
                        minLength={5}
                        placeholder="Clerical correction, late-arriving result, clarification…"
                      />
                    </FormField>
                    <Button type="submit" variant="outline">
                      Start amendment
                    </Button>
                  </form>
                ) : null}
              </>
            ) : canWrite ? (
              <>
                {noteIsAmendment && note ? (
                  <div className="border-warning/30 bg-warning/5 mb-4 rounded-md border p-3 text-sm">
                    <strong>Amending:</strong> this is v{note.version} (supersedes v
                    {note.version - 1}). Prior content is pre-filled. Save and sign when ready.
                  </div>
                ) : null}

                <form action={saveNoteDraft} className="space-y-4">
                  <input type="hidden" name="encounter_id" value={encounter.id} />
                  <input type="hidden" name="patient_id" value={encounter.patient_id} />
                  {note?.id ? <input type="hidden" name="note_id" value={note.id} /> : null}
                  <FormField
                    label="Subjective"
                    htmlFor="subjective"
                    helper="HPI, ROS, patient-reported."
                  >
                    <Textarea
                      id="subjective"
                      name="subjective"
                      rows={4}
                      defaultValue={note?.subjective ?? ""}
                    />
                  </FormField>
                  <FormField label="Objective" htmlFor="objective" helper="Exam findings, results.">
                    <Textarea
                      id="objective"
                      name="objective"
                      rows={4}
                      defaultValue={note?.objective ?? ""}
                    />
                  </FormField>
                  <FormField
                    label="Assessment"
                    htmlFor="assessment"
                    helper="Diagnoses, differential."
                  >
                    <Textarea
                      id="assessment"
                      name="assessment"
                      rows={3}
                      defaultValue={note?.assessment ?? ""}
                    />
                  </FormField>
                  <FormField
                    label="Plan"
                    htmlFor="plan"
                    helper="Orders, follow-up, patient education."
                  >
                    <Textarea id="plan" name="plan" rows={3} defaultValue={note?.plan ?? ""} />
                  </FormField>
                  <div className="flex items-center gap-2">
                    <Button type="submit" variant="outline">
                      Save draft
                    </Button>
                  </div>
                </form>

                {canSign && note && note.status !== "signed" ? (
                  <form
                    action={signNote}
                    className="border-success/30 bg-success/5 mt-6 space-y-3 rounded-md border p-4"
                  >
                    <input type="hidden" name="encounter_id" value={encounter.id} />
                    <input type="hidden" name="note_id" value={note.id} />
                    <div className="text-sm font-medium">Ready to sign?</div>
                    <p className="text-muted-foreground text-xs">
                      Signing freezes the note at this version. A SHA-256 hash of the content is
                      written to <code>public.signatures</code> with your user id. Amendments create
                      a new version.
                    </p>
                    <FormField
                      label="Attestation"
                      htmlFor="attestation"
                      helper="The text stored with your signature."
                    >
                      <Input
                        id="attestation"
                        name="attestation"
                        defaultValue="Reviewed and attested to by signer."
                      />
                    </FormField>
                    <Button type="submit">Sign note</Button>
                  </form>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No note yet.</p>
            )}
          </CardContent>
        </Card>

        {/* AI scribe review card — slots between Clinical note and Documents.
            Renders nothing when user lacks ai:invoke. See docs/ai-scribe-review-ui.md. */}
        <AIReviewCard
          encounterId={encounter.id}
          patientId={encounter.patient_id}
          session={session}
          searchParams={{ showLow: sp.showLow }}
        />

        {/* Charge capture — slots between AI review and Documents. Hidden
            for users without billing:read or charges:capture. See
            docs/charge-capture.md. */}
        <ChargeCaptureCard
          encounterId={encounter.id}
          patientId={encounter.patient_id}
          encounterDate={encounter.start_at.slice(0, 10)}
          session={session}
        />

        {/* Documents (read-only — upload UI ships with Storage bucket wiring) */}
        <Card>
          <CardHeader>
            <CardTitle>Documents ({documents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name / Kind</TableHead>
                    <TableHead>Mime</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Signed</TableHead>
                    <TableHead>Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-medium">{d.label ?? "(unnamed)"}</div>
                        <div className="text-muted-foreground text-xs">
                          <Badge variant="muted">{d.kind.replace(/_/g, " ")}</Badge>{" "}
                          <span className="text-xs">via {d.source}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{d.mime_type}</TableCell>
                      <TableCell className="text-xs">
                        {(d.size_bytes / 1024).toFixed(1)} KB
                      </TableCell>
                      <TableCell>
                        {d.signed_at ? (
                          <Badge variant="success">Signed</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(d.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-sm">
                No documents attached to this encounter. Upload UI ships in a later slice along with
                the Supabase Storage bucket configuration.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Version history */}
        {history.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Version history ({history.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">v{h.version}</span>
                        <Badge variant={NOTE_STATUS_VARIANTS[h.status] ?? "default"}>
                          {h.status}
                        </Badge>
                        {h.amended_from ? (
                          <span className="text-muted-foreground text-xs">(amendment)</span>
                        ) : null}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {h.author?.full_name ?? h.author?.email ?? "—"} ·{" "}
                        {h.signed_at
                          ? `signed ${new Date(h.signed_at).toLocaleString()}`
                          : `updated ${new Date(h.updated_at).toLocaleString()}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {/* Note audit trail — visible only to roles with audit:read */}
        {canViewAudit ? (
          <Card>
            <CardHeader>
              <CardTitle>Note audit trail ({auditEvents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {auditEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No audit events yet. Events accrue as notes are created, saved, signed, or
                  amended.
                </p>
              ) : (
                <ul className="divide-y text-sm">
                  {auditEvents.map((ev) => (
                    <li key={ev.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono text-xs">
                          {new Date(ev.occurred_at).toLocaleString()}
                        </span>
                        <Badge variant="muted">{ev.action}</Badge>
                        {ev.event_type ? <Badge variant="default">{ev.event_type}</Badge> : null}
                      </div>
                      {ev.row_id ? (
                        <div className="text-muted-foreground font-mono text-xs">
                          note {ev.row_id.slice(0, 8)}…
                        </div>
                      ) : null}
                      {ev.details && Object.keys(ev.details).length > 0 ? (
                        <div className="text-muted-foreground text-xs">
                          {Object.entries(ev.details)
                            .slice(0, 3)
                            .map(
                              ([k, v]) =>
                                `${k}=${typeof v === "string" ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60)}`,
                            )
                            .join(", ")}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-muted-foreground mt-3 text-xs">
                Showing up to 20 most recent events for notes in this encounter. Full audit viewer
                at <code>/admin/security</code> ships in a later slice.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
