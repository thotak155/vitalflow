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

type AppointmentRow = {
  id: string;
  patient_id: string;
  provider_id: string;
  location_id: string | null;
  encounter_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  reason: string | null;
  visit_type: string | null;
  telehealth_url: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  patient: { id: string; given_name: string; family_name: string; mrn: string } | null;
  provider: { full_name: string | null; email: string } | null;
  location: { name: string } | null;
};

const STATUS_VARIANTS: Record<string, "muted" | "success" | "warning" | "destructive" | "default"> =
  {
    scheduled: "default",
    confirmed: "success",
    arrived: "warning",
    in_progress: "warning",
    completed: "success",
    cancelled: "destructive",
    no_show: "destructive",
    rescheduled: "muted",
  };

const NEXT_STATUS: Record<string, { label: string; next: string }[]> = {
  scheduled: [
    { label: "Confirm", next: "confirmed" },
    { label: "Mark arrived", next: "arrived" },
    { label: "No-show", next: "no_show" },
  ],
  confirmed: [
    { label: "Mark arrived", next: "arrived" },
    { label: "No-show", next: "no_show" },
  ],
  arrived: [{ label: "Start visit", next: "in_progress" }],
  in_progress: [{ label: "Complete", next: "completed" }],
  completed: [],
  cancelled: [],
  no_show: [],
  rescheduled: [],
};

type WritableApptsTable = {
  update: (v: Record<string, unknown>) => {
    eq: (
      c: string,
      v: string,
    ) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};
function apptsTable(c: SupabaseServerClient): WritableApptsTable {
  return (c as unknown as { from: (t: string) => WritableApptsTable }).from("appointments");
}

async function setStatus(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "schedule:write");

  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!id || !next) {
    redirect(`/appointments?error=${encodeURIComponent("Missing id or status")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await apptsTable(supabase)
    .update({ status: next })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/appointments/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/appointments/${id}`);
  redirect(
    `/appointments/${id}?ok=${encodeURIComponent(`Status set to ${next.replace(/_/g, " ")}`)}`,
  );
}

async function cancelAppointment(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "schedule:write");

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("cancelled_reason") ?? "").trim();
  if (!id || !reason) {
    redirect(`/appointments/${id}?error=${encodeURIComponent("Cancellation reason is required")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await apptsTable(supabase)
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: reason,
    })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/appointments/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/appointments/${id}`);
  redirect(`/appointments/${id}?ok=${encodeURIComponent("Appointment cancelled")}`);
}

async function openEncounter(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "clinical:write");

  const id = String(formData.get("id") ?? "");
  if (!id) {
    redirect(`/appointments?error=${encodeURIComponent("Missing appointment id")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { data: apptRaw } = await supabase
    .from("appointments")
    .select("id, patient_id, provider_id, encounter_id, start_at, reason, status")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  const appt = apptRaw as {
    id: string;
    patient_id: string;
    provider_id: string;
    encounter_id: string | null;
    start_at: string;
    reason: string | null;
    status: string;
  } | null;
  if (!appt) {
    redirect(`/appointments?error=${encodeURIComponent("Appointment not found")}`);
  }
  if (appt.encounter_id) {
    redirect(`/encounters/${appt.encounter_id}`);
  }

  // Create encounter in-progress, link back from the appointment.
  const encInsert = await (
    supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => {
          select: (s: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from("encounters")
    .insert({
      tenant_id: session.tenantId,
      patient_id: appt.patient_id,
      provider_id: appt.provider_id,
      class: "ambulatory",
      status: "in_progress",
      start_at: appt.start_at,
      reason: appt.reason,
    })
    .select("id")
    .single();
  if (encInsert.error || !encInsert.data) {
    redirect(
      `/appointments/${id}?error=${encodeURIComponent(
        encInsert.error?.message ?? "Failed to open encounter",
      )}`,
    );
  }

  // Link the appointment and advance its status if not already in progress.
  const { error: apptErr } = await apptsTable(supabase)
    .update({
      encounter_id: encInsert.data.id,
      status: appt.status === "completed" ? appt.status : "in_progress",
    })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (apptErr) {
    redirect(`/appointments/${id}?error=${encodeURIComponent(apptErr.message)}`);
  }

  redirect(`/encounters/${encInsert.data.id}`);
}

async function updateDetails(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  requirePermission(session, "schedule:write");

  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "").trim();
  const durationMinutes = Number.parseInt(String(formData.get("duration_minutes") ?? "30"), 10);
  const reason = String(formData.get("reason") ?? "").trim();
  const visitType = String(formData.get("visit_type") ?? "in_person").trim();
  if (!id || !date || !startTime) {
    redirect(`/appointments/${id}?error=${encodeURIComponent("Date and start time are required")}`);
  }
  const startAt = new Date(`${date}T${startTime}:00.000Z`);
  if (Number.isNaN(startAt.getTime())) {
    redirect(`/appointments/${id}?error=${encodeURIComponent("Invalid date or time")}`);
  }
  const endAt = new Date(startAt.getTime() + Math.max(5, durationMinutes) * 60 * 1000);

  const supabase = await createVitalFlowServerClient();
  const { error } = await apptsTable(supabase)
    .update({
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      reason: reason || null,
      visit_type: visitType || null,
    })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/appointments/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/appointments/${id}`);
  redirect(`/appointments/${id}?ok=${encodeURIComponent("Appointment updated")}`);
}

export default async function AppointmentDetailPage({
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
  requirePermission(session, "schedule:read");

  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createVitalFlowServerClient();
  const { data: apptRaw } = await supabase
    .from("appointments")
    .select(
      "id, patient_id, provider_id, location_id, encounter_id, start_at, end_at, status, reason, visit_type, telehealth_url, cancelled_at, cancelled_reason, " +
        "patient:patients!appointments_patient_id_fkey(id, given_name, family_name, mrn), " +
        "provider:profiles!appointments_provider_profile_fkey(full_name, email), " +
        "location:locations!appointments_location_id_fkey(name)",
    )
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  const appt = apptRaw as AppointmentRow | null;

  if (!appt) {
    notFound();
  }

  const startDate = new Date(appt.start_at);
  const durationMin = Math.round((new Date(appt.end_at).getTime() - startDate.getTime()) / 60000);
  const canWrite = session.permissions.includes("schedule:write");
  const transitions = NEXT_STATUS[appt.status] ?? [];
  const isActive = !["cancelled", "no_show", "completed"].includes(appt.status);

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[
          { label: "Home", href: "/" },
          { label: "Appointments", href: "/appointments" },
          {
            label:
              `${appt.patient?.given_name ?? ""} ${appt.patient?.family_name ?? ""}`.trim() || id,
          },
        ]}
      />
      <PageHeader
        eyebrow="Appointment"
        title={
          appt.patient ? `${appt.patient.given_name} ${appt.patient.family_name}` : "Appointment"
        }
        description={
          <span className="text-muted-foreground flex items-center gap-3 text-sm">
            <span>{startDate.toLocaleString()}</span>
            <span>·</span>
            <span>{durationMin} min</span>
            <span>·</span>
            <span>{appt.provider?.full_name ?? appt.provider?.email ?? "—"}</span>
            {appt.location?.name ? (
              <>
                <span>·</span>
                <span>{appt.location.name}</span>
              </>
            ) : null}
            <Badge variant={STATUS_VARIANTS[appt.status] ?? "default"}>
              {appt.status.replace(/_/g, " ")}
            </Badge>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {appt.encounter_id ? (
              <Button asChild>
                <NextLink href={`/encounters/${appt.encounter_id}`}>Open encounter</NextLink>
              </Button>
            ) : canWrite && session.permissions.includes("clinical:write") && isActive ? (
              <form action={openEncounter}>
                <input type="hidden" name="id" value={appt.id} />
                <Button type="submit">Open encounter</Button>
              </form>
            ) : null}
            {appt.patient ? (
              <Button asChild variant="outline">
                <NextLink href={`/patients/${appt.patient_id}`}>Open chart</NextLink>
              </Button>
            ) : null}
          </div>
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
        {canWrite && isActive && transitions.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {transitions.map((t) => (
                  <form action={setStatus} key={t.next}>
                    <input type="hidden" name="id" value={appt.id} />
                    <input type="hidden" name="next" value={t.next} />
                    <Button type="submit" variant="outline">
                      {t.label}
                    </Button>
                  </form>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Visit details</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite && isActive ? (
              <form action={updateDetails} className="space-y-4">
                <input type="hidden" name="id" value={appt.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Date" htmlFor="date" required>
                    <Input
                      id="date"
                      name="date"
                      type="date"
                      defaultValue={appt.start_at.slice(0, 10)}
                      required
                    />
                  </FormField>
                  <FormField label="Start time" htmlFor="start_time" required>
                    <Input
                      id="start_time"
                      name="start_time"
                      type="time"
                      defaultValue={appt.start_at.slice(11, 16)}
                      required
                    />
                  </FormField>
                  <FormField label="Duration (min)" htmlFor="duration_minutes">
                    <Input
                      id="duration_minutes"
                      name="duration_minutes"
                      type="number"
                      min={5}
                      max={480}
                      defaultValue={durationMin}
                    />
                  </FormField>
                  <FormField label="Visit type" htmlFor="visit_type">
                    <Select name="visit_type" defaultValue={appt.visit_type ?? "in_person"}>
                      <SelectTrigger id="visit_type">
                        <SelectValue />
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
                  <Textarea id="reason" name="reason" rows={3} defaultValue={appt.reason ?? ""} />
                </FormField>
                <Button type="submit">Save changes</Button>
              </form>
            ) : (
              <dl className="grid gap-2 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">When</dt>
                  <dd>
                    {startDate.toLocaleString()} ({durationMin} min)
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Visit type</dt>
                  <dd>{appt.visit_type ?? "in_person"}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd>{appt.reason ?? "—"}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {appt.status === "cancelled" && appt.cancelled_reason ? (
          <Card>
            <CardHeader>
              <CardTitle>Cancelled</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {appt.cancelled_at ? new Date(appt.cancelled_at).toLocaleString() : ""} —{" "}
                {appt.cancelled_reason}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {canWrite && isActive ? (
          <Card>
            <CardHeader>
              <CardTitle>Cancel appointment</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={cancelAppointment} className="space-y-3">
                <input type="hidden" name="id" value={appt.id} />
                <FormField label="Reason" htmlFor="cancelled_reason" required>
                  <Textarea
                    id="cancelled_reason"
                    name="cancelled_reason"
                    rows={2}
                    required
                    placeholder="Patient cancelled, rescheduling…"
                  />
                </FormField>
                <Button type="submit" variant="destructive">
                  Cancel appointment
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Encounter</CardTitle>
          </CardHeader>
          <CardContent>
            {appt.encounter_id ? (
              <p className="text-sm">
                Encounter linked.{" "}
                <NextLink
                  href={`/encounters/${appt.encounter_id}`}
                  className="text-primary hover:underline"
                >
                  Open encounter →
                </NextLink>
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                No encounter yet. Click <strong>Open encounter</strong> above to start the visit and
                open the clinical workspace.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
