"use client";

import {
  Button,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@vitalflow/ui";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";

import { findConflicts, type BusyWindow } from "../../../../lib/appointments/busy-time.js";

interface ProviderOption {
  user_id: string;
  full_name: string | null;
  email: string;
}
interface LocationOption {
  id: string;
  name: string;
}
interface PresetPatient {
  id: string;
  mrn: string;
  given_name: string;
  family_name: string;
}

export interface BookingFormProps {
  /** Server action that creates the appointment. */
  createAppointment: (formData: FormData) => Promise<void>;
  providers: readonly ProviderOption[];
  locations: readonly LocationOption[];
  presetPatient: PresetPatient | null;
  defaultDate: string;
  defaultProviderId: string;
}

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;
const PIXELS_PER_HOUR = 56;
const STRIP_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * PIXELS_PER_HOUR;

function timeToOffset(iso: string): number {
  const d = new Date(iso);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return ((minutes - DAY_START_HOUR * 60) / 60) * PIXELS_PER_HOUR;
}

function fmtTime(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

export function BookingForm({
  createAppointment,
  providers,
  locations,
  presetPatient,
  defaultDate,
  defaultProviderId,
}: BookingFormProps) {
  const [providerId, setProviderId] = useState(defaultProviderId);
  const [locationId, setLocationId] = useState<string>("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState<BusyWindow[]>([]);
  const [loadingBusy, setLoadingBusy] = useState(false);

  // Refetch busy windows whenever provider / location / date changes
  useEffect(() => {
    if (!providerId || !date) return;
    let cancelled = false;
    setLoadingBusy(true);
    const params = new URLSearchParams({ provider_id: providerId, date });
    if (locationId) params.set("location_id", locationId);
    fetch(`/api/appointments/busy-time?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { windows: [] }))
      .then((j: { windows?: BusyWindow[] }) => {
        if (!cancelled) setBusy(j.windows ?? []);
      })
      .catch(() => {
        if (!cancelled) setBusy([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId, date, locationId]);

  // Compute the proposed window + conflicts
  const proposed = useMemo(() => {
    if (!startTime || !date) return null;
    const startAt = `${date}T${startTime}:00.000Z`;
    const startMs = Date.parse(startAt);
    if (Number.isNaN(startMs)) return null;
    const endMs = startMs + Math.max(5, duration) * 60 * 1000;
    const endAt = new Date(endMs).toISOString();
    return {
      start_at: startAt,
      end_at: endAt,
      provider_id: providerId,
      location_id: locationId || null,
    };
  }, [startTime, date, duration, providerId, locationId]);

  const conflicts = useMemo(
    () => (proposed ? findConflicts(busy, proposed) : []),
    [busy, proposed],
  );
  const providerConflicts = conflicts.filter((c) => c.kind === "provider");
  const locationConflicts = conflicts.filter((c) => c.kind === "location");
  const submitDisabled = providerConflicts.length > 0;

  return (
    <form action={createAppointment} className="grid gap-6 md:grid-cols-[1fr,260px]">
      {/* ---------------- left: form fields ---------------- */}
      <div className="space-y-4">
        {presetPatient ? (
          <div className="border-input bg-muted/30 rounded-md border p-3 text-sm">
            <div className="text-muted-foreground text-xs uppercase">Patient</div>
            <div className="font-medium">
              {presetPatient.given_name} {presetPatient.family_name}
            </div>
            <div className="text-muted-foreground font-mono text-xs">{presetPatient.mrn}</div>
            <input type="hidden" name="patient_id" value={presetPatient.id} />
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
            <Select name="provider_id" value={providerId} onValueChange={setProviderId}>
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
            <Select name="location_id" value={locationId} onValueChange={setLocationId}>
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
            <Input
              id="date"
              name="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Start time" htmlFor="start_time" required>
            <Input
              id="start_time"
              name="start_time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
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
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 30)}
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

        {/* Live conflict messages */}
        {providerConflicts.length > 0 ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm"
          >
            <span aria-hidden>⛔</span>
            <span>
              <strong>Provider conflict.</strong> This overlaps{" "}
              {providerConflicts[0]?.provider_name ?? "the selected provider"}&rsquo;s appointment
              from {fmtTime(providerConflicts[0]!.start_at)} to{" "}
              {fmtTime(providerConflicts[0]!.end_at)}. Pick a different time.
            </span>
          </div>
        ) : null}
        {providerConflicts.length === 0 && locationConflicts.length > 0 ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            <span aria-hidden>⚠️</span>
            <span>
              <strong>Location busy.</strong> This room is also booked from{" "}
              {fmtTime(locationConflicts[0]!.start_at)} to {fmtTime(locationConflicts[0]!.end_at)}.
              You can still book — confirm the room is shareable, or pick a different time.
            </span>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitDisabled}>
            Book appointment
          </Button>
          <Button asChild variant="outline">
            <NextLink href="/appointments">Cancel</NextLink>
          </Button>
        </div>
      </div>

      {/* ---------------- right: day strip ---------------- */}
      <aside className="hidden md:block">
        <div className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
          Provider&rsquo;s day {loadingBusy ? "(loading…)" : `· ${busy.length} booked`}
        </div>
        <div
          className="border-border relative overflow-hidden rounded-md border bg-slate-50"
          style={{ height: STRIP_HEIGHT }}
          aria-label="Provider day strip"
        >
          {/* Hour ticks */}
          {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => {
            const hour = DAY_START_HOUR + i;
            const top = i * PIXELS_PER_HOUR;
            return (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-slate-200"
                style={{ top }}
              >
                <span className="absolute -top-2.5 left-1 bg-slate-50 px-1 text-[10px] text-slate-500">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            );
          })}

          {/* Existing busy windows */}
          {busy.map((w) => {
            const top = Math.max(0, timeToOffset(w.start_at));
            const height = Math.max(8, timeToOffset(w.end_at) - timeToOffset(w.start_at));
            const isProviderRow = w.provider_id === providerId;
            return (
              <div
                key={w.id}
                className={`absolute left-12 right-2 rounded border px-1.5 py-0.5 text-[10px] leading-tight shadow-sm ${
                  isProviderRow
                    ? "border-slate-400 bg-slate-200 text-slate-800"
                    : "border-amber-300 bg-amber-100 text-amber-900"
                }`}
                style={{ top, height }}
                title={`${fmtTime(w.start_at)}–${fmtTime(w.end_at)}${w.provider_name ? ` · ${w.provider_name}` : ""}`}
              >
                <div className="font-mono">
                  {fmtTime(w.start_at)}–{fmtTime(w.end_at)}
                </div>
                {isProviderRow ? null : (
                  <div className="truncate text-[9px] opacity-75">{w.provider_name ?? "—"}</div>
                )}
              </div>
            );
          })}

          {/* Proposed window overlay */}
          {proposed
            ? (() => {
                const top = timeToOffset(proposed.start_at);
                const height = Math.max(
                  8,
                  timeToOffset(proposed.end_at) - timeToOffset(proposed.start_at),
                );
                if (top < 0 || top > STRIP_HEIGHT) return null;
                const cls = providerConflicts.length
                  ? "border-red-500 bg-red-200/70 text-red-900"
                  : locationConflicts.length
                    ? "border-amber-500 bg-amber-200/70 text-amber-900"
                    : "border-emerald-500 bg-emerald-200/70 text-emerald-900";
                return (
                  <div
                    className={`absolute left-12 right-2 rounded border-2 px-1.5 py-0.5 text-[10px] font-medium leading-tight ${cls}`}
                    style={{ top, height }}
                    aria-label="Proposed appointment window"
                  >
                    Proposed · {fmtTime(proposed.start_at)}–{fmtTime(proposed.end_at)}
                  </div>
                );
              })()
            : null}
        </div>
        <p className="text-muted-foreground mt-2 text-[11px]">
          Grey = same provider · Amber = same location, other provider · Green/red/amber outline =
          your proposed slot.
        </p>
      </aside>
    </form>
  );
}
