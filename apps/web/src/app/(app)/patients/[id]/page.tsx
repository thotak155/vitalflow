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
    eq: (c: string, v: string) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};
type WritableContactsTable = {
  insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  update: (v: Record<string, unknown>) => {
    eq: (c: string, v: string) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};
function patientsTable(c: SupabaseServerClient): WritablePatientsTable {
  return (c as unknown as { from: (t: string) => WritablePatientsTable }).from("patients");
}
function contactsTable(c: SupabaseServerClient): WritableContactsTable {
  return (c as unknown as { from: (t: string) => WritableContactsTable }).from("patient_contacts");
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
          <span className="flex items-center gap-3 text-sm text-muted-foreground">
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
                    <Input
                      id="pronouns"
                      name="pronouns"
                      defaultValue={patient.pronouns ?? ""}
                    />
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
              <p className="text-sm text-muted-foreground">No contacts on file.</p>
            ) : (
              <ul className="mb-4 divide-y">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <div className="font-medium">{c.value}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
              <form action={addContact} className="space-y-3 rounded-md border border-dashed border-border p-4">
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
            <CardTitle>Coverages</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Insurance coverage editing ships with the billing surface (next slice). Data already
              stores in <code>patient_coverages</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
