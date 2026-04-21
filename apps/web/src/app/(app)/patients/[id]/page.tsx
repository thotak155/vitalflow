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
      </div>
    </>
  );
}
