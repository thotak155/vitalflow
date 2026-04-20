import { requirePermission } from "@vitalflow/auth/rbac";
import {
  createVitalFlowServerClient,
  type SupabaseServerClient,
} from "@vitalflow/auth/server";
import {
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
import { AlertCircle } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

interface NewPatientSearchParams {
  error?: string;
}

type WritablePatientsTable = {
  insert: (
    v: Record<string, unknown>,
  ) => {
    select: (s: string) => {
      single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
    };
  };
};
function patientsTable(c: SupabaseServerClient): WritablePatientsTable {
  return (c as unknown as { from: (t: string) => WritablePatientsTable }).from("patients");
}

function generateMrn(): string {
  // Tenant-scoped MRN. Human-friendly prefix + base36 timestamp slug; unique
  // enough for manual entry. A real MRN sequencer lives in a future migration.
  return `MRN-${Date.now().toString(36).toUpperCase()}`;
}

async function createPatient(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/patients/new");
  }
  requirePermission(session, "patient:write");

  const given = String(formData.get("given_name") ?? "").trim();
  const family = String(formData.get("family_name") ?? "").trim();
  const preferred = String(formData.get("preferred_name") ?? "").trim();
  const dob = String(formData.get("date_of_birth") ?? "").trim();
  const sex = String(formData.get("sex_at_birth") ?? "").trim();
  const pronouns = String(formData.get("pronouns") ?? "").trim();
  const mrnInput = String(formData.get("mrn") ?? "").trim();

  if (!given || !family || !dob || !sex) {
    redirect(
      `/patients/new?error=${encodeURIComponent("First name, last name, DOB, and sex at birth are required")}`,
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    redirect(`/patients/new?error=${encodeURIComponent("DOB must be YYYY-MM-DD")}`);
  }

  const mrn = mrnInput || generateMrn();

  const supabase = await createVitalFlowServerClient();
  const { data, error } = await patientsTable(supabase)
    .insert({
      tenant_id: session.tenantId,
      mrn,
      given_name: given,
      family_name: family,
      preferred_name: preferred || null,
      date_of_birth: dob,
      sex_at_birth: sex,
      pronouns: pronouns || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/patients/new?error=${encodeURIComponent(error?.message ?? "Failed to create patient")}`,
    );
  }

  redirect(`/patients/${data.id}`);
}

export default async function NewPatientPage({
  searchParams,
}: {
  searchParams: Promise<NewPatientSearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/patients/new");
  }
  requirePermission(session, "patient:write");

  const params = await searchParams;

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[
          { label: "Home", href: "/" },
          { label: "Patients", href: "/patients" },
          { label: "New" },
        ]}
      />
      <PageHeader
        eyebrow="Clinical"
        title="New patient"
        description="Create a chart for a new patient. Contacts and coverages can be added after the chart is created."
      />

      {params.error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span>{params.error}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Demographics</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPatient} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="First name" htmlFor="given_name" required>
                <Input id="given_name" name="given_name" type="text" required autoComplete="off" />
              </FormField>
              <FormField label="Last name" htmlFor="family_name" required>
                <Input id="family_name" name="family_name" type="text" required autoComplete="off" />
              </FormField>
              <FormField
                label="Preferred name"
                htmlFor="preferred_name"
                helper="If the patient goes by a different name."
              >
                <Input id="preferred_name" name="preferred_name" type="text" autoComplete="off" />
              </FormField>
              <FormField label="Pronouns" htmlFor="pronouns">
                <Input
                  id="pronouns"
                  name="pronouns"
                  type="text"
                  placeholder="she/her, he/him, they/them…"
                  autoComplete="off"
                />
              </FormField>
              <FormField label="Date of birth" htmlFor="date_of_birth" required>
                <Input id="date_of_birth" name="date_of_birth" type="date" required />
              </FormField>
              <FormField label="Sex at birth" htmlFor="sex_at_birth" required>
                <Select name="sex_at_birth">
                  <SelectTrigger id="sex_at_birth">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="intersex">Intersex</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label="MRN"
                htmlFor="mrn"
                helper="Leave blank to auto-generate."
              >
                <Input id="mrn" name="mrn" type="text" autoComplete="off" placeholder="MRN-…" />
              </FormField>
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit">Create patient</Button>
              <Button asChild variant="outline">
                <NextLink href="/patients">Cancel</NextLink>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
