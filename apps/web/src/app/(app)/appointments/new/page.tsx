import { requirePermission } from "@vitalflow/auth/rbac";
import { createVitalFlowServerClient, type SupabaseServerClient } from "@vitalflow/auth/server";
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
  Textarea,
} from "@vitalflow/ui";
import { AlertCircle } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

interface NewApptSearchParams {
  date?: string;
  patient_id?: string;
  error?: string;
}

type WritableApptsTable = {
  insert: (v: Record<string, unknown>) => {
    select: (s: string) => {
      single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
    };
  };
};
function apptsTable(c: SupabaseServerClient): WritableApptsTable {
  return (c as unknown as { from: (t: string) => WritableApptsTable }).from("appointments");
}

type ProviderOption = { user_id: string; full_name: string | null; email: string };
type LocationOption = { id: string; name: string };

async function createAppointment(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/appointments/new");
  }
  requirePermission(session, "schedule:write");

  const patientMrn = String(formData.get("patient_mrn") ?? "").trim();
  const patientIdDirect = String(formData.get("patient_id") ?? "").trim();
  const providerId = String(formData.get("provider_id") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "").trim();
  const durationMinutes = Number.parseInt(String(formData.get("duration_minutes") ?? "30"), 10);
  const reason = String(formData.get("reason") ?? "").trim();
  const visitType = String(formData.get("visit_type") ?? "in_person").trim();

  if (!providerId || !date || !startTime) {
    redirect(
      `/appointments/new?error=${encodeURIComponent(
        "Provider, date, and start time are required",
      )}`,
    );
  }

  const supabase = await createVitalFlowServerClient();

  // Resolve patient — prefer the hidden field if set, else look up by MRN.
  let patientId = patientIdDirect;
  if (!patientId) {
    if (!patientMrn) {
      redirect(
        `/appointments/new?error=${encodeURIComponent("Enter patient MRN or open from a chart")}`,
      );
    }
    const { data: pRaw } = await supabase
      .from("patients")
      .select("id")
      .eq("tenant_id", session.tenantId)
      .eq("mrn", patientMrn)
      .is("deleted_at", null)
      .maybeSingle();
    const p = pRaw as { id: string } | null;
    if (!p) {
      redirect(
        `/appointments/new?error=${encodeURIComponent(`No patient with MRN ${patientMrn}`)}`,
      );
    }
    patientId = p.id;
  }

  // Browser submits local time via `<input type="date">` + `<input type="time">`;
  // interpret as UTC for now (noted in caveat). A tz-aware version uses the
  // location's `locations.timezone` once the location picker is mandatory.
  const startAt = new Date(`${date}T${startTime}:00.000Z`);
  if (Number.isNaN(startAt.getTime())) {
    redirect(`/appointments/new?error=${encodeURIComponent("Invalid date or time")}`);
  }
  const endAt = new Date(startAt.getTime() + Math.max(5, durationMinutes) * 60 * 1000);

  const { data, error } = await apptsTable(supabase)
    .insert({
      tenant_id: session.tenantId,
      patient_id: patientId,
      provider_id: providerId,
      location_id: locationId || null,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      reason: reason || null,
      visit_type: visitType || null,
      booked_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    redirect(
      `/appointments/new?error=${encodeURIComponent(error?.message ?? "Failed to create appointment")}`,
    );
  }
  redirect(`/appointments/${data.id}`);
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<NewApptSearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/appointments/new");
  }
  requirePermission(session, "schedule:write");

  const params = await searchParams;
  const defaultDate = params.date ?? new Date().toISOString().slice(0, 10);
  const presetPatientId = params.patient_id;

  const supabase = await createVitalFlowServerClient();

  const { data: providersRaw } = await supabase
    .from("tenant_members")
    .select("user_id, profiles:user_id(full_name, email)")
    .eq("tenant_id", session.tenantId)
    .eq("status", "active")
    .is("deleted_at", null);
  const providers = (
    (providersRaw ?? []) as unknown as {
      user_id: string;
      profiles: { full_name: string | null; email: string } | null;
    }[]
  )
    .map<ProviderOption>((r) => ({
      user_id: r.user_id,
      full_name: r.profiles?.full_name ?? null,
      email: r.profiles?.email ?? "",
    }))
    .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));

  const { data: locationsRaw } = await supabase
    .from("locations")
    .select("id, name")
    .eq("tenant_id", session.tenantId)
    .eq("active", true)
    .order("name", { ascending: true });
  const locations = (locationsRaw ?? []) as unknown as LocationOption[];

  // If a patient is preset via query param, load their display fields for the UI.
  type PresetPatient = { mrn: string; given_name: string; family_name: string };
  let presetPatient: PresetPatient | null = null;
  if (presetPatientId) {
    const { data: pRaw } = await supabase
      .from("patients")
      .select("mrn, given_name, family_name")
      .eq("id", presetPatientId)
      .eq("tenant_id", session.tenantId)
      .maybeSingle();
    presetPatient = pRaw as unknown as PresetPatient | null;
  }

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[
          { label: "Home", href: "/" },
          { label: "Appointments", href: "/appointments" },
          { label: "New" },
        ]}
      />
      <PageHeader
        eyebrow="Schedule"
        title="New appointment"
        description="Book a visit. Look up the patient by MRN — patient search autocomplete lands with the scheduler workflow."
      />

      {params.error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 mb-4 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{params.error}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Visit details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAppointment} className="space-y-4">
            {presetPatient ? (
              <div className="border-input bg-muted/30 rounded-md border p-3 text-sm">
                <div className="text-muted-foreground text-xs uppercase">Patient</div>
                <div className="font-medium">
                  {presetPatient.given_name} {presetPatient.family_name}
                </div>
                <div className="text-muted-foreground font-mono text-xs">{presetPatient.mrn}</div>
                <input type="hidden" name="patient_id" value={presetPatientId} />
              </div>
            ) : (
              <FormField label="Patient MRN" htmlFor="patient_mrn" required>
                <Input
                  id="patient_mrn"
                  name="patient_mrn"
                  placeholder="MRN-XXXX"
                  required
                  autoComplete="off"
                />
              </FormField>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Provider" htmlFor="provider_id" required>
                <Select name="provider_id" defaultValue={session.userId}>
                  <SelectTrigger id="provider_id">
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.full_name ?? p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Location" htmlFor="location_id" helper="Optional.">
                <Select name="location_id">
                  <SelectTrigger id="location_id">
                    <SelectValue
                      placeholder={locations.length ? "Select a location" : "No locations"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Date" htmlFor="date" required>
                <Input id="date" name="date" type="date" defaultValue={defaultDate} required />
              </FormField>
              <FormField label="Start time" htmlFor="start_time" required>
                <Input id="start_time" name="start_time" type="time" required />
              </FormField>
              <FormField label="Duration (min)" htmlFor="duration_minutes">
                <Input
                  id="duration_minutes"
                  name="duration_minutes"
                  type="number"
                  min={5}
                  max={480}
                  defaultValue={30}
                />
              </FormField>
              <FormField label="Visit type" htmlFor="visit_type">
                <Select name="visit_type" defaultValue="in_person">
                  <SelectTrigger id="visit_type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_person">In person</SelectItem>
                    <SelectItem value="telehealth">Telehealth</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <FormField label="Reason for visit" htmlFor="reason">
              <Textarea
                id="reason"
                name="reason"
                rows={3}
                placeholder="Chief complaint or follow-up…"
              />
            </FormField>

            <div className="flex items-center gap-2">
              <Button type="submit">Book appointment</Button>
              <Button asChild variant="outline">
                <NextLink href="/appointments">Cancel</NextLink>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
