import { createHash } from "node:crypto";

import { requirePermission } from "@vitalflow/auth/rbac";
import {
  createVitalFlowServerClient,
  type SupabaseServerClient,
} from "@vitalflow/auth/server";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Textarea,
} from "@vitalflow/ui";
import { AlertCircle, CheckCircle2 } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSession } from "../../../../lib/session.js";

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

const STATUS_VARIANTS: Record<string, "muted" | "success" | "warning" | "destructive" | "default"> = {
  planned: "default",
  arrived: "warning",
  in_progress: "warning",
  finished: "success",
  cancelled: "destructive",
};

const NOTE_STATUS_VARIANTS: Record<string, "muted" | "success" | "warning" | "destructive" | "default"> = {
  draft: "warning",
  pending_review: "warning",
  signed: "success",
  amended: "muted",
};

// Narrow writes to side-step missing `Database` shape inference.
type WritableTable<TSel extends string = "id"> = {
  insert: (v: Record<string, unknown>) => {
    select: (s: string) => {
      single: () => Promise<{ data: Record<TSel, string> | null; error: { message: string } | null }>;
    };
  };
  update: (v: Record<string, unknown>) => {
    eq: (c: string, v: string) => {
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
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent("Missing encounter or patient")}`);
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
  const note = noteRaw as { id: string; version: number; subjective: string | null; objective: string | null; assessment: string | null; plan: string | null; status: string } | null;
  if (!note) {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent("Note not found")}`);
  }
  if (note.status === "signed") {
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent("Note already signed — use amend to modify")}`);
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
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent(`Signature failed: ${sigErr.message}`)}`);
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
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent(`Sign failed: ${noteErr.message}`)}`);
  }

  revalidatePath(`/encounters/${encounterId}`);
  redirect(`/encounters/${encounterId}?ok=${encodeURIComponent("Note signed")}`);
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
    ([k, v]) => ["tenant_id", "patient_id", "encounter_id", "recorded_by"].includes(k) || v === null,
  );
  if (allEmpty) {
    redirect(
      `/encounters/${encounterId}?error=${encodeURIComponent("Enter at least one vital sign")}`,
    );
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await (supabase as unknown as {
    from: (t: string) => { insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
  })
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
  searchParams: Promise<{ ok?: string; error?: string }>;
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

  // Active note: latest non-amended revision for this encounter.
  const { data: noteRaw } = await supabase
    .from("encounter_notes")
    .select(
      "id, encounter_id, patient_id, author_id, type, status, subjective, objective, assessment, plan, signed_by, signed_at, version, updated_at",
    )
    .eq("encounter_id", id)
    .eq("tenant_id", session.tenantId)
    .is("amended_from", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const note = noteRaw as NoteRow | null;

  const { data: vitalsRaw } = await supabase
    .from("vitals")
    .select(
      "id, recorded_at, recorded_by, systolic_mmhg, diastolic_mmhg, heart_rate_bpm, respiratory_rate, temperature_c, spo2_pct, weight_kg, height_cm, pain_score, notes",
    )
    .eq("encounter_id", id)
    .eq("tenant_id", session.tenantId)
    .order("recorded_at", { ascending: false });
  const vitals = (vitalsRaw ?? []) as unknown as VitalsRow[];

  const displayName = encounter.patient
    ? `${encounter.patient.given_name} ${encounter.patient.family_name}`
    : "Encounter";

  const canWrite = session.permissions.includes("clinical:write");
  const canSign = session.permissions.includes("clinical:sign");
  const canRecordVitals = session.permissions.includes("patient:write");
  const noteSigned = note?.status === "signed";
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
          <span className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {encounter.patient ? (
              <>
                <span className="font-mono">{encounter.patient.mrn}</span>
                <span>·</span>
                <span>
                  DOB {encounter.patient.date_of_birth} ({calcAge(encounter.patient.date_of_birth)} y)
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
          className="mb-4 flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          <span>{sp.ok}</span>
        </div>
      ) : null}
      {sp.error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
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
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="planned">Planned</option>
                      <option value="arrived">Arrived</option>
                      <option value="in_progress">In progress</option>
                      <option value="finished">Finished</option>
                    </select>
                  </FormField>
                </div>
                <FormField label="Reason" htmlFor="reason">
                  <Textarea id="reason" name="reason" rows={2} defaultValue={encounter.reason ?? ""} />
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
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.recorded_at).toLocaleString()}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {v.systolic_mmhg && v.diastolic_mmhg ? (
                        <span>BP {v.systolic_mmhg}/{v.diastolic_mmhg}</span>
                      ) : null}
                      {v.heart_rate_bpm ? <span>HR {v.heart_rate_bpm}</span> : null}
                      {v.respiratory_rate ? <span>RR {v.respiratory_rate}</span> : null}
                      {v.temperature_c ? <span>Temp {v.temperature_c}°C</span> : null}
                      {v.spo2_pct ? <span>SpO₂ {v.spo2_pct}%</span> : null}
                      {v.weight_kg ? <span>Wt {v.weight_kg}kg</span> : null}
                      {v.height_cm ? <span>Ht {v.height_cm}cm</span> : null}
                      {v.pain_score !== null ? <span>Pain {v.pain_score}/10</span> : null}
                    </div>
                    {v.notes ? <div className="text-xs text-muted-foreground">{v.notes}</div> : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {canRecordVitals && !encounterFinished ? (
              <form
                action={recordVitals}
                className="space-y-3 rounded-md border border-dashed border-border p-4"
              >
                <input type="hidden" name="encounter_id" value={encounter.id} />
                <input type="hidden" name="patient_id" value={encounter.patient_id} />
                <div className="grid gap-3 md:grid-cols-4">
                  <FormField label="Systolic" htmlFor="systolic_mmhg">
                    <Input id="systolic_mmhg" name="systolic_mmhg" type="number" min={40} max={300} />
                  </FormField>
                  <FormField label="Diastolic" htmlFor="diastolic_mmhg">
                    <Input id="diastolic_mmhg" name="diastolic_mmhg" type="number" min={20} max={200} />
                  </FormField>
                  <FormField label="HR" htmlFor="heart_rate_bpm">
                    <Input id="heart_rate_bpm" name="heart_rate_bpm" type="number" min={20} max={300} />
                  </FormField>
                  <FormField label="RR" htmlFor="respiratory_rate">
                    <Input id="respiratory_rate" name="respiratory_rate" type="number" min={5} max={60} />
                  </FormField>
                  <FormField label="Temp (°C)" htmlFor="temperature_c">
                    <Input id="temperature_c" name="temperature_c" type="number" step="0.1" min={30} max={45} />
                  </FormField>
                  <FormField label="SpO₂ (%)" htmlFor="spo2_pct">
                    <Input id="spo2_pct" name="spo2_pct" type="number" min={50} max={100} />
                  </FormField>
                  <FormField label="Weight (kg)" htmlFor="weight_kg">
                    <Input id="weight_kg" name="weight_kg" type="number" step="0.1" min={0.5} max={500} />
                  </FormField>
                  <FormField label="Height (cm)" htmlFor="height_cm">
                    <Input id="height_cm" name="height_cm" type="number" step="0.1" min={20} max={250} />
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
                Clinical note {note ? <Badge variant={NOTE_STATUS_VARIANTS[note.status] ?? "default"}>{note.status}</Badge> : null}
              </span>
              {note?.version ? (
                <span className="text-xs text-muted-foreground">v{note.version}</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {noteSigned && note ? (
              <div className="space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  Signed {note.signed_at ? new Date(note.signed_at).toLocaleString() : ""} — amend to add an addendum.
                </p>
                {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
                  <div key={k}>
                    <div className="text-xs font-medium uppercase text-muted-foreground">{k}</div>
                    <div className="whitespace-pre-wrap rounded-md border border-input bg-muted/30 p-3">
                      {note[k] ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            ) : canWrite ? (
              <form action={saveNoteDraft} className="space-y-4">
                <input type="hidden" name="encounter_id" value={encounter.id} />
                <input type="hidden" name="patient_id" value={encounter.patient_id} />
                {note?.id ? <input type="hidden" name="note_id" value={note.id} /> : null}
                <FormField label="Subjective" htmlFor="subjective" helper="HPI, ROS, patient-reported.">
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
                <FormField label="Assessment" htmlFor="assessment" helper="Diagnoses, differential.">
                  <Textarea
                    id="assessment"
                    name="assessment"
                    rows={3}
                    defaultValue={note?.assessment ?? ""}
                  />
                </FormField>
                <FormField label="Plan" htmlFor="plan" helper="Orders, follow-up, patient education.">
                  <Textarea id="plan" name="plan" rows={3} defaultValue={note?.plan ?? ""} />
                </FormField>
                <div className="flex items-center gap-2">
                  <Button type="submit" variant="outline">
                    Save draft
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">No note yet.</p>
            )}

            {canSign && note && note.status !== "signed" ? (
              <form action={signNote} className="mt-6 space-y-3 rounded-md border border-success/30 bg-success/5 p-4">
                <input type="hidden" name="encounter_id" value={encounter.id} />
                <input type="hidden" name="note_id" value={note.id} />
                <div className="text-sm font-medium">Ready to sign?</div>
                <p className="text-xs text-muted-foreground">
                  Signing freezes the note at this version. A SHA-256 hash of the content is written
                  to <code>public.signatures</code> with your user id. Amendments create a new version.
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
          </CardContent>
        </Card>
      </div>
    </>
  );
}
