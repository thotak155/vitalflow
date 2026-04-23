import { requirePermission } from "@vitalflow/auth/rbac";
import { createVitalFlowServerClient, type SupabaseServerClient } from "@vitalflow/auth/server";
import { Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";
import { AlertCircle } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { redirect } from "next/navigation";

import {
  findConflicts,
  NON_BUSY_STATUSES,
  type BusyWindow,
} from "../../../../lib/appointments/busy-time.js";
import { getSession } from "../../../../lib/session.js";

import { BookingForm } from "./BookingForm.js";

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

  // UC-B5 — server-side pre-check for slot conflicts. Query the whole day's
  // appointments for the provider OR the location (if one is selected), then
  // use the pure helper to categorize same-provider conflicts (hard block)
  // and same-location / different-provider conflicts (soft warning).
  const dayStart = new Date(startAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  type BusyRowDb = {
    id: string;
    start_at: string;
    end_at: string;
    provider_id: string;
    location_id: string | null;
    status: string;
    provider: { full_name: string | null; email: string } | null;
  };
  let busyQ = supabase
    .from("appointments")
    .select(
      "id, start_at, end_at, provider_id, location_id, status, " +
        "provider:profiles!appointments_provider_profile_fkey(full_name, email)",
    )
    .eq("tenant_id", session.tenantId)
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString())
    .not("status", "in", `(${NON_BUSY_STATUSES.join(",")})`);
  if (locationId) {
    busyQ = busyQ.or(`provider_id.eq.${providerId},location_id.eq.${locationId}`);
  } else {
    busyQ = busyQ.eq("provider_id", providerId);
  }
  const { data: busyRaw } = await busyQ;
  const busy: BusyWindow[] = ((busyRaw as BusyRowDb[] | null) ?? []).map((r) => ({
    id: r.id,
    start_at: r.start_at,
    end_at: r.end_at,
    provider_id: r.provider_id,
    location_id: r.location_id,
    status: r.status,
    provider_name: r.provider?.full_name ?? r.provider?.email ?? null,
  }));
  const conflicts = findConflicts(busy, {
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    provider_id: providerId,
    location_id: locationId || null,
  });
  const providerConflict = conflicts.find((c) => c.kind === "provider");
  if (providerConflict) {
    const who = providerConflict.provider_name ?? "this provider";
    const from = new Date(providerConflict.start_at).toISOString().slice(11, 16);
    const to = new Date(providerConflict.end_at).toISOString().slice(11, 16);
    redirect(
      `/appointments/new?error=${encodeURIComponent(
        `This overlaps ${who}'s appointment from ${from} to ${to}.`,
      )}&date=${encodeURIComponent(date)}`,
    );
  }

  const insertResult = await apptsTable(supabase)
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
  if (insertResult.error || !insertResult.data) {
    // Race path: another scheduler booked the same provider between our
    // pre-check and insert. Postgres's `appointments_no_overlap` exclusion
    // constraint rejects it with SQLSTATE 23P01. Surface a friendly message
    // instead of the raw DB text.
    const msg = insertResult.error?.message ?? "Failed to create appointment";
    const friendly = msg.includes("appointments_no_overlap")
      ? "Another appointment was just booked for this provider in the same window. Pick a different time."
      : msg;
    redirect(
      `/appointments/new?error=${encodeURIComponent(friendly)}&date=${encodeURIComponent(date)}`,
    );
  }
  redirect(`/appointments/${insertResult.data.id}`);
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
    .select("user_id, profiles:profiles!tenant_members_user_profile_fkey(full_name, email)")
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
          <BookingForm
            createAppointment={createAppointment}
            providers={providers}
            locations={locations}
            presetPatient={
              presetPatient && presetPatientId
                ? {
                    id: presetPatientId,
                    mrn: presetPatient.mrn,
                    given_name: presetPatient.given_name,
                    family_name: presetPatient.family_name,
                  }
                : null
            }
            defaultDate={defaultDate}
            defaultProviderId={session.userId}
          />
        </CardContent>
      </Card>
    </>
  );
}
