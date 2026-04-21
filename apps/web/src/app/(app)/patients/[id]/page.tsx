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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@vitalflow/ui";
import { AlertCircle, CheckCircle2 } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSession } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

type PatientRow = {
  id: string;
  mrn: string;
  given_name: string;
  family_name: string;
  preferred_name: string | null;
  date_of_birth: string;
  sex_at_birth: string;
  gender_identity: string | null;
  pronouns: string | null;
  preferred_language: string | null;
  deceased_at: string | null;
};

type ContactRow = {
  id: string;
  type: string;
  value: string;
  is_primary: boolean;
  verified_at: string | null;
};

type CoverageRow = {
  id: string;
  payer_id: string;
  type: string;
  plan_name: string | null;
  member_id: string;
  group_number: string | null;
  subscriber_name: string | null;
  relationship: string | null;
  effective_start: string | null;
  effective_end: string | null;
  active: boolean;
  payer: { name: string; payer_code: string | null } | null;
};

type PayerOption = { id: string; name: string };

type AllergyRow = {
  id: string;
  type: string;
  substance: string;
  reaction: string | null;
  severity: string | null;
  onset_date: string | null;
};

type MedicationRow = {
  id: string;
  display_name: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  status: string;
  start_date: string | null;
};

type ProblemRow = {
  id: string;
  code: string;
  description: string;
  status: string;
  onset_date: string | null;
  resolved_date: string | null;
};

type VisitRow = {
  id: string;
  start_at: string;
  status: string;
  reason: string | null;
  chief_complaint: string | null;
  provider_id: string;
  note_status: string | null;
  note_id: string | null;
};

type BalanceRow = {
  current_balance_minor: number;
  aging_0_30_minor: number;
  aging_31_60_minor: number;
  aging_61_90_minor: number;
  aging_over_90_minor: number;
  currency: string;
  last_payment_at: string | null;
};

function fmtMoney(minor: number, currency: string): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const dollars = (abs / 100).toFixed(2);
  return `${sign}${currency === "USD" ? "$" : `${currency} `}${dollars}`;
}

const SEVERITY_VARIANTS: Record<string, "muted" | "warning" | "destructive"> = {
  mild: "muted",
  moderate: "warning",
  severe: "destructive",
  life_threatening: "destructive",
};

const MED_STATUS_VARIANTS: Record<string, "success" | "warning" | "muted"> = {
  active: "success",
  on_hold: "warning",
  completed: "muted",
  stopped: "muted",
  draft: "muted",
};

const ENCOUNTER_STATUS_VARIANTS: Record<
  string,
  "muted" | "success" | "warning" | "destructive" | "default"
> = {
  planned: "default",
  arrived: "warning",
  in_progress: "warning",
  finished: "success",
  cancelled: "destructive",
};

const CONTACT_TYPES = [
  { value: "phone_mobile", label: "Mobile phone" },
  { value: "phone_home", label: "Home phone" },
  { value: "phone_work", label: "Work phone" },
  { value: "email", label: "Email" },
  { value: "address", label: "Address" },
] as const;

function contactLabel(type: string): string {
  return CONTACT_TYPES.find((c) => c.value === type)?.label ?? type;
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

// `SupabaseServerClient`'s generated Database types don't re-infer row shapes
// through `@supabase/ssr`. Narrow writes with a thin cast — same pattern used
// in admin/members and session.ts.
type WritablePatientsTable = {
  update: (v: Record<string, unknown>) => {
    eq: (
      c: string,
      v: string,
    ) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};
type WritableContactsTable = {
  insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  update: (v: Record<string, unknown>) => {
    eq: (
      c: string,
      v: string,
    ) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};
type WritableCoveragesTable = WritableContactsTable;
function patientsTable(c: SupabaseServerClient): WritablePatientsTable {
  return (c as unknown as { from: (t: string) => WritablePatientsTable }).from("patients");
}
function contactsTable(c: SupabaseServerClient): WritableContactsTable {
  return (c as unknown as { from: (t: string) => WritableContactsTable }).from("patient_contacts");
}
function coveragesTable(c: SupabaseServerClient): WritableCoveragesTable {
  return (c as unknown as { from: (t: string) => WritableCoveragesTable }).from(
    "patient_coverages",
  );
}

async function updatePatient(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "patient:write");

  const id = String(formData.get("id") ?? "");
  if (!id) {
    redirect(`/patients?error=${encodeURIComponent("Missing patient id")}`);
  }

  const payload = {
    given_name: String(formData.get("given_name") ?? "").trim(),
    family_name: String(formData.get("family_name") ?? "").trim(),
    preferred_name: String(formData.get("preferred_name") ?? "").trim() || null,
    pronouns: String(formData.get("pronouns") ?? "").trim() || null,
    gender_identity: String(formData.get("gender_identity") ?? "").trim() || null,
    preferred_language: String(formData.get("preferred_language") ?? "").trim() || null,
  };
  if (!payload.given_name || !payload.family_name) {
    redirect(`/patients/${id}?error=${encodeURIComponent("First and last name are required")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await patientsTable(supabase)
    .update(payload)
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/patients/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/patients/${id}`);
  redirect(`/patients/${id}?ok=${encodeURIComponent("Demographics updated")}`);
}

async function addContact(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "patient:write");

  const patientId = String(formData.get("patient_id") ?? "");
  const type = String(formData.get("type") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  const isPrimary = formData.get("is_primary") === "on";

  if (!patientId || !type || !value) {
    redirect(`/patients/${patientId}?error=${encodeURIComponent("Type and value are required")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await contactsTable(supabase).insert({
    tenant_id: session.tenantId,
    patient_id: patientId,
    type,
    value,
    is_primary: isPrimary,
  });
  if (error) {
    redirect(`/patients/${patientId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}?ok=${encodeURIComponent("Contact added")}`);
}

async function removeContact(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "patient:write");

  const id = String(formData.get("id") ?? "");
  const patientId = String(formData.get("patient_id") ?? "");
  if (!id || !patientId) {
    redirect(`/patients?error=${encodeURIComponent("Missing contact id")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await contactsTable(supabase)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/patients/${patientId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}?ok=${encodeURIComponent("Contact removed")}`);
}

async function addCoverage(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "patient:write");

  const patientId = String(formData.get("patient_id") ?? "");
  const payerId = String(formData.get("payer_id") ?? "");
  const type = String(formData.get("type") ?? "").trim();
  const memberId = String(formData.get("member_id") ?? "").trim();
  const planName = String(formData.get("plan_name") ?? "").trim();
  const groupNumber = String(formData.get("group_number") ?? "").trim();
  const subscriberName = String(formData.get("subscriber_name") ?? "").trim();
  const relationship = String(formData.get("relationship") ?? "").trim();
  const effectiveStart = String(formData.get("effective_start") ?? "").trim();
  const effectiveEnd = String(formData.get("effective_end") ?? "").trim();

  if (!patientId || !payerId || !type || !memberId) {
    redirect(
      `/patients/${patientId}?error=${encodeURIComponent(
        "Payer, coverage type, and member id are required",
      )}`,
    );
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await coveragesTable(supabase).insert({
    tenant_id: session.tenantId,
    patient_id: patientId,
    payer_id: payerId,
    type,
    plan_name: planName || null,
    member_id: memberId,
    group_number: groupNumber || null,
    subscriber_name: subscriberName || null,
    relationship: relationship || null,
    effective_start: effectiveStart || null,
    effective_end: effectiveEnd || null,
    currency: "USD",
    active: true,
  });
  if (error) {
    redirect(`/patients/${patientId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}?ok=${encodeURIComponent("Coverage added")}`);
}

async function setCoverageActive(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "patient:write");

  const id = String(formData.get("id") ?? "");
  const patientId = String(formData.get("patient_id") ?? "");
  const next = formData.get("active") === "1";
  if (!id || !patientId) {
    redirect(`/patients?error=${encodeURIComponent("Missing ids")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await coveragesTable(supabase)
    .update({ active: next })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/patients/${patientId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/patients/${patientId}`);
  redirect(
    `/patients/${patientId}?ok=${encodeURIComponent(next ? "Coverage activated" : "Coverage deactivated")}`,
  );
}

export default async function PatientDetailPage({
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
  requirePermission(session, "patient:read");

  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createVitalFlowServerClient();
  const { data: patientRaw } = await supabase
    .from("patients")
    .select(
      "id, mrn, given_name, family_name, preferred_name, date_of_birth, sex_at_birth, gender_identity, pronouns, preferred_language, deceased_at",
    )
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  const patient = patientRaw as PatientRow | null;

  if (!patient) {
    notFound();
  }

  const { data: contactsRaw } = await supabase
    .from("patient_contacts")
    .select("id, type, value, is_primary, verified_at")
    .eq("patient_id", id)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  const contacts = (contactsRaw ?? []) as unknown as ContactRow[];

  const { data: coveragesRaw } = await supabase
    .from("patient_coverages")
    .select(
      "id, payer_id, type, plan_name, member_id, group_number, subscriber_name, relationship, effective_start, effective_end, active, payer:payer_id(name, payer_code)",
    )
    .eq("patient_id", id)
    .eq("tenant_id", session.tenantId)
    .order("active", { ascending: false })
    .order("type", { ascending: true });
  const coverages = (coveragesRaw ?? []) as unknown as CoverageRow[];

  const { data: payersRaw } = await supabase
    .from("payers")
    .select("id, name")
    .eq("tenant_id", session.tenantId)
    .eq("active", true)
    .order("name", { ascending: true });
  const payers = (payersRaw ?? []) as unknown as PayerOption[];

  // --- Clinical summary fetches (run in parallel) ---------------------------
  const [allergiesResp, medsResp, problemsResp, diagnosesResp, visitsResp, balanceResp] =
    await Promise.all([
      supabase
        .from("allergies")
        .select("id, type, substance, reaction, severity, onset_date")
        .eq("patient_id", id)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("medications")
        .select("id, display_name, dose, route, frequency, status, start_date")
        .eq("patient_id", id)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .in("status", ["active", "on_hold"])
        .order("start_date", { ascending: false }),
      supabase
        .from("problems")
        .select("id, code, description, status, onset_date, resolved_date")
        .eq("patient_id", id)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("onset_date", { ascending: false, nullsFirst: false }),
      supabase
        .from("diagnosis_assignments")
        .select("id, code, description, rank, assigned_at, encounter_id, removed_at")
        .eq("patient_id", id)
        .eq("tenant_id", session.tenantId)
        .is("removed_at", null)
        .order("assigned_at", { ascending: false })
        .limit(20),
      supabase
        .from("encounters")
        .select("id, start_at, status, reason, chief_complaint, provider_id")
        .eq("patient_id", id)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("start_at", { ascending: false })
        .limit(10),
      supabase
        .from("patient_balances")
        .select(
          "current_balance_minor, aging_0_30_minor, aging_31_60_minor, aging_61_90_minor, aging_over_90_minor, currency, last_payment_at",
        )
        .eq("patient_id", id)
        .eq("tenant_id", session.tenantId)
        .maybeSingle(),
    ]);
  const allergies = (allergiesResp.data as AllergyRow[] | null) ?? [];
  const medications = (medsResp.data as MedicationRow[] | null) ?? [];
  const problems = (problemsResp.data as ProblemRow[] | null) ?? [];
  type DiagnosisAssignmentRow = {
    id: string;
    code: string;
    description: string;
    rank: number | null;
    assigned_at: string;
    encounter_id: string;
  };
  const diagnosisRows = (diagnosesResp.data as DiagnosisAssignmentRow[] | null) ?? [];
  type EncounterMini = {
    id: string;
    start_at: string;
    status: string;
    reason: string | null;
    chief_complaint: string | null;
    provider_id: string;
  };
  const visitsRaw = (visitsResp.data as EncounterMini[] | null) ?? [];
  const balance = balanceResp.data as BalanceRow | null;

  // Fetch note status per visit + provider display names (follow-up queries)
  const visitIds = visitsRaw.map((v) => v.id);
  const providerIds = Array.from(new Set(visitsRaw.map((v) => v.provider_id).filter(Boolean)));
  const [notesResp, providersResp] = await Promise.all([
    visitIds.length > 0
      ? supabase
          .from("encounter_notes")
          .select("id, encounter_id, status")
          .in("encounter_id", visitIds)
          .eq("tenant_id", session.tenantId)
          .neq("status", "amended")
      : Promise.resolve({
          data: null as null | { id: string; encounter_id: string; status: string }[],
        }),
    providerIds.length > 0
      ? supabase.from("profiles").select("id, full_name, email").in("id", providerIds)
      : Promise.resolve({
          data: null as null | { id: string; full_name: string | null; email: string }[],
        }),
  ]);
  const notesByEnc = new Map<string, { id: string; status: string }>();
  for (const n of notesResp.data ?? []) {
    notesByEnc.set(n.encounter_id, { id: n.id, status: n.status });
  }
  const providerMap = new Map<string, string>();
  for (const p of providersResp.data ?? []) {
    providerMap.set(p.id, p.full_name ?? p.email);
  }
  const visits: (VisitRow & { providerName: string | null })[] = visitsRaw.map((v) => ({
    ...v,
    note_id: notesByEnc.get(v.id)?.id ?? null,
    note_status: notesByEnc.get(v.id)?.status ?? null,
    providerName: providerMap.get(v.provider_id) ?? null,
  }));

  // Deduplicate diagnoses by code for a compact problem-list view.
  const dxByCode = new Map<string, DiagnosisAssignmentRow>();
  for (const d of diagnosisRows) {
    if (!dxByCode.has(d.code)) dxByCode.set(d.code, d);
  }
  const uniqueDx = Array.from(dxByCode.values());

  const displayName = patient.preferred_name
    ? `${patient.preferred_name} (${patient.given_name}) ${patient.family_name}`
    : `${patient.given_name} ${patient.family_name}`;

  const canWrite = session.permissions.includes("patient:write");

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[
          { label: "Home", href: "/" },
          { label: "Patients", href: "/patients" },
          { label: displayName },
        ]}
      />
      <PageHeader
        eyebrow="Patient chart"
        title={displayName}
        description={
          <span className="text-muted-foreground flex items-center gap-3 text-sm">
            <span className="font-mono">{patient.mrn}</span>
            <span>·</span>
            <span>
              DOB {patient.date_of_birth} ({calcAge(patient.date_of_birth)} y)
            </span>
            <span>·</span>
            <span className="capitalize">{patient.sex_at_birth}</span>
            {patient.pronouns ? (
              <>
                <span>·</span>
                <span>{patient.pronouns}</span>
              </>
            ) : null}
            {patient.deceased_at ? <Badge variant="muted">Deceased</Badge> : null}
          </span>
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
        <Card>
          <CardHeader>
            <CardTitle>Demographics</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite ? (
              <form action={updatePatient} className="space-y-4">
                <input type="hidden" name="id" value={patient.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="First name" htmlFor="given_name" required>
                    <Input
                      id="given_name"
                      name="given_name"
                      defaultValue={patient.given_name}
                      required
                    />
                  </FormField>
                  <FormField label="Last name" htmlFor="family_name" required>
                    <Input
                      id="family_name"
                      name="family_name"
                      defaultValue={patient.family_name}
                      required
                    />
                  </FormField>
                  <FormField label="Preferred name" htmlFor="preferred_name">
                    <Input
                      id="preferred_name"
                      name="preferred_name"
                      defaultValue={patient.preferred_name ?? ""}
                    />
                  </FormField>
                  <FormField label="Pronouns" htmlFor="pronouns">
                    <Input id="pronouns" name="pronouns" defaultValue={patient.pronouns ?? ""} />
                  </FormField>
                  <FormField label="Gender identity" htmlFor="gender_identity">
                    <Input
                      id="gender_identity"
                      name="gender_identity"
                      defaultValue={patient.gender_identity ?? ""}
                    />
                  </FormField>
                  <FormField label="Preferred language" htmlFor="preferred_language">
                    <Input
                      id="preferred_language"
                      name="preferred_language"
                      defaultValue={patient.preferred_language ?? "en-US"}
                      placeholder="en-US"
                    />
                  </FormField>
                </div>
                <Button type="submit">Save demographics</Button>
              </form>
            ) : (
              <dl className="grid gap-2 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Preferred language</dt>
                  <dd>{patient.preferred_language ?? "en-US"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Gender identity</dt>
                  <dd>{patient.gender_identity ?? "—"}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contacts ({contacts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-muted-foreground text-sm">No contacts on file.</p>
            ) : (
              <ul className="mb-4 divide-y">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <div className="font-medium">{c.value}</div>
                      <div className="text-muted-foreground flex items-center gap-2 text-xs">
                        <span>{contactLabel(c.type)}</span>
                        {c.is_primary ? <Badge variant="success">Primary</Badge> : null}
                        {c.verified_at ? <Badge variant="muted">Verified</Badge> : null}
                      </div>
                    </div>
                    {canWrite ? (
                      <form action={removeContact}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="patient_id" value={patient.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          Remove
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canWrite ? (
              <form
                action={addContact}
                className="border-border space-y-3 rounded-md border border-dashed p-4"
              >
                <input type="hidden" name="patient_id" value={patient.id} />
                <div className="grid gap-3 md:grid-cols-[180px,1fr,auto]">
                  <FormField label="Type" htmlFor="contact-type" required>
                    <Select name="type">
                      <SelectTrigger id="contact-type">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Value" htmlFor="contact-value" required>
                    <Input id="contact-value" name="value" required />
                  </FormField>
                  <div className="flex items-end">
                    <Button type="submit">Add</Button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="is_primary" />
                  Mark as primary for this type
                </label>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coverages ({coverages.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {coverages.length > 0 ? (
              <ul className="mb-4 divide-y text-sm">
                {coverages.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.payer?.name ?? "Unknown payer"}</span>
                        <Badge variant={c.type === "primary" ? "success" : "muted"}>
                          {c.type.replace(/_/g, " ")}
                        </Badge>
                        {c.active ? null : <Badge variant="muted">Inactive</Badge>}
                      </div>
                      <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span>
                          Member <span className="font-mono">{c.member_id}</span>
                        </span>
                        {c.plan_name ? <span>{c.plan_name}</span> : null}
                        {c.group_number ? <span>Group {c.group_number}</span> : null}
                        {c.subscriber_name ? (
                          <span>
                            Subscriber {c.subscriber_name}
                            {c.relationship ? ` (${c.relationship})` : ""}
                          </span>
                        ) : null}
                        {c.effective_start || c.effective_end ? (
                          <span>
                            {c.effective_start ?? "—"} → {c.effective_end ?? "open"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {canWrite ? (
                      <form action={setCoverageActive}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="patient_id" value={patient.id} />
                        <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                        <Button type="submit" size="sm" variant="outline">
                          {c.active ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {canWrite ? (
              payers.length === 0 ? (
                <div className="border-border rounded-md border border-dashed p-4 text-sm">
                  <p>
                    No active payers yet. Go to{" "}
                    <NextLink href="/admin/payers" className="text-primary hover:underline">
                      Admin → Payers
                    </NextLink>{" "}
                    to add one, then come back to attach coverage.
                  </p>
                </div>
              ) : (
                <form
                  action={addCoverage}
                  className="border-border space-y-3 rounded-md border border-dashed p-4"
                >
                  <input type="hidden" name="patient_id" value={patient.id} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Payer" htmlFor="payer_id" required>
                      <Select name="payer_id">
                        <SelectTrigger id="payer_id">
                          <SelectValue placeholder="Select a payer" />
                        </SelectTrigger>
                        <SelectContent>
                          {payers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Type" htmlFor="cov-type" required>
                      <Select name="type" defaultValue="primary">
                        <SelectTrigger id="cov-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="primary">Primary</SelectItem>
                          <SelectItem value="secondary">Secondary</SelectItem>
                          <SelectItem value="tertiary">Tertiary</SelectItem>
                          <SelectItem value="self_pay">Self-pay</SelectItem>
                          <SelectItem value="workers_comp">Workers comp</SelectItem>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Member ID" htmlFor="member_id" required>
                      <Input id="member_id" name="member_id" required />
                    </FormField>
                    <FormField label="Plan name" htmlFor="plan_name">
                      <Input id="plan_name" name="plan_name" placeholder="PPO Gold" />
                    </FormField>
                    <FormField label="Group number" htmlFor="group_number">
                      <Input id="group_number" name="group_number" />
                    </FormField>
                    <FormField
                      label="Subscriber name"
                      htmlFor="subscriber_name"
                      helper="If not the patient."
                    >
                      <Input id="subscriber_name" name="subscriber_name" />
                    </FormField>
                    <FormField label="Relationship" htmlFor="relationship">
                      <Select name="relationship">
                        <SelectTrigger id="relationship">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="self">Self</SelectItem>
                          <SelectItem value="spouse">Spouse</SelectItem>
                          <SelectItem value="child">Child</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Effective start" htmlFor="effective_start">
                      <Input id="effective_start" name="effective_start" type="date" />
                    </FormField>
                    <FormField label="Effective end" htmlFor="effective_end">
                      <Input id="effective_end" name="effective_end" type="date" />
                    </FormField>
                  </div>
                  <Button type="submit">Add coverage</Button>
                </form>
              )
            ) : null}
          </CardContent>
        </Card>

        {/* -------- Clinical summary strip -------- */}
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryTile
            label="Active problems"
            value={uniqueDx.length + problems.filter((p) => p.status === "active").length}
            accent={
              allergies.some((a) => a.severity === "life_threatening") ? "destructive" : "default"
            }
          />
          <SummaryTile label="Allergies" value={allergies.length} />
          <SummaryTile
            label="Active medications"
            value={medications.filter((m) => m.status === "active").length}
          />
          <SummaryTile
            label="Balance"
            value={balance ? fmtMoney(balance.current_balance_minor, balance.currency) : "—"}
          />
        </div>

        {/* -------- Allergies -------- */}
        <Card>
          <CardHeader>
            <CardTitle>Allergies ({allergies.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {allergies.length === 0 ? (
              <p className="text-muted-foreground text-sm">No known allergies.</p>
            ) : (
              <ul className="divide-y text-sm">
                {allergies.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.substance}</span>
                        <Badge variant="muted">{a.type}</Badge>
                        {a.severity ? (
                          <Badge variant={SEVERITY_VARIANTS[a.severity] ?? "muted"}>
                            {a.severity.replace(/_/g, " ")}
                          </Badge>
                        ) : null}
                      </div>
                      {a.reaction ? (
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          Reaction: {a.reaction}
                        </p>
                      ) : null}
                    </div>
                    {a.onset_date ? (
                      <span className="text-muted-foreground text-xs">Onset {a.onset_date}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* -------- Medications -------- */}
        <Card>
          <CardHeader>
            <CardTitle>
              Medications ({medications.filter((m) => m.status === "active").length} active
              {medications.filter((m) => m.status === "on_hold").length > 0
                ? ` · ${medications.filter((m) => m.status === "on_hold").length} on hold`
                : ""}
              )
            </CardTitle>
          </CardHeader>
          <CardContent>
            {medications.length === 0 ? (
              <p className="text-muted-foreground text-sm">No active medications.</p>
            ) : (
              <ul className="divide-y text-sm">
                {medications.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.display_name}</span>
                        <Badge variant={MED_STATUS_VARIANTS[m.status] ?? "muted"}>
                          {m.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {[m.dose, m.route, m.frequency].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    {m.start_date ? (
                      <span className="text-muted-foreground text-xs">Since {m.start_date}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* -------- Problem list (diagnoses + problems) -------- */}
        <Card>
          <CardHeader>
            <CardTitle>Problem list ({uniqueDx.length + problems.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {uniqueDx.length === 0 && problems.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No active problems or diagnoses on file.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {problems.map((p) => (
                  <li key={`p-${p.id}`} className="flex items-start justify-between gap-2 py-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{p.code}</span>
                        <span className="font-medium">{p.description}</span>
                        <Badge
                          variant={
                            p.status === "active"
                              ? "warning"
                              : p.status === "resolved"
                                ? "success"
                                : "muted"
                          }
                        >
                          {p.status}
                        </Badge>
                      </div>
                      {p.onset_date || p.resolved_date ? (
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {p.onset_date ? `Onset ${p.onset_date}` : ""}
                          {p.resolved_date ? ` · Resolved ${p.resolved_date}` : ""}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
                {uniqueDx.map((d) => (
                  <li key={`d-${d.id}`} className="flex items-start justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{d.code}</span>
                      <span className="font-medium">{d.description}</span>
                      <Badge variant="muted">Encounter-assigned</Badge>
                    </div>
                    <NextLink
                      href={`/encounters/${d.encounter_id}`}
                      className="text-xs text-sky-700 hover:underline"
                    >
                      View visit →
                    </NextLink>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* -------- Visits -------- */}
        <Card>
          <CardHeader>
            <CardTitle>Recent visits ({visits.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {visits.length === 0 ? (
              <p className="text-muted-foreground text-sm">No visits yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {visits.map((v) => {
                  const subject = v.chief_complaint ?? v.reason ?? "—";
                  return (
                    <li
                      key={v.id}
                      className="flex flex-wrap items-start justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <NextLink
                            href={`/encounters/${v.id}`}
                            className="font-medium text-sky-700 hover:underline"
                          >
                            {new Date(v.start_at).toLocaleString()}
                          </NextLink>
                          <Badge variant={ENCOUNTER_STATUS_VARIANTS[v.status] ?? "default"}>
                            {v.status.replace(/_/g, " ")}
                          </Badge>
                          {v.note_status ? (
                            <Badge
                              variant={
                                v.note_status === "signed"
                                  ? "success"
                                  : v.note_status === "draft"
                                    ? "warning"
                                    : "muted"
                              }
                            >
                              Note: {v.note_status.replace(/_/g, " ")}
                            </Badge>
                          ) : v.status === "finished" ? (
                            <Badge variant="destructive">Note missing</Badge>
                          ) : null}
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs">{subject}</p>
                      </div>
                      <div className="text-muted-foreground text-right text-xs">
                        {v.providerName ?? "—"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* -------- Balance / aging -------- */}
        <Card>
          <CardHeader>
            <CardTitle>Billing balance</CardTitle>
          </CardHeader>
          <CardContent>
            {balance ? (
              <>
                <div className="mb-3 flex items-baseline gap-3">
                  <span className="text-3xl font-semibold">
                    {fmtMoney(balance.current_balance_minor, balance.currency)}
                  </span>
                  <span className="text-muted-foreground text-sm">current balance</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  <AgingCell
                    label="0–30"
                    minor={balance.aging_0_30_minor}
                    currency={balance.currency}
                  />
                  <AgingCell
                    label="31–60"
                    minor={balance.aging_31_60_minor}
                    currency={balance.currency}
                  />
                  <AgingCell
                    label="61–90"
                    minor={balance.aging_61_90_minor}
                    currency={balance.currency}
                  />
                  <AgingCell
                    label="90+"
                    minor={balance.aging_over_90_minor}
                    currency={balance.currency}
                  />
                </dl>
                {balance.last_payment_at ? (
                  <p className="text-muted-foreground mt-3 text-xs">
                    Last payment received {new Date(balance.last_payment_at).toLocaleString()}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No balance record yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function SummaryTile({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: number | string;
  accent?: "default" | "destructive";
}) {
  return (
    <Card className={accent === "destructive" ? "border-destructive/40" : undefined}>
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
        <p
          className={`mt-1 text-2xl font-semibold ${
            accent === "destructive" ? "text-destructive" : ""
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function AgingCell({ label, minor, currency }: { label: string; minor: number; currency: string }) {
  return (
    <div className="rounded border border-slate-200 p-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{fmtMoney(minor, currency)}</dd>
    </div>
  );
}
