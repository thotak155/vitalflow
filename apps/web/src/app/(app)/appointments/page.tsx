import { requirePermission } from "@vitalflow/auth/rbac";
import { createVitalFlowServerClient } from "@vitalflow/auth/server";
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
} from "@vitalflow/ui";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { EmptyState, PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "../../../lib/session.js";

export const dynamic = "force-dynamic";

interface AppointmentsSearchParams {
  date?: string;
  status?: string;
  view?: string;
}

type AppointmentRow = {
  id: string;
  patient_id: string;
  provider_id: string;
  start_at: string;
  end_at: string;
  status: string;
  reason: string | null;
  visit_type: string | null;
  patient: { given_name: string; family_name: string; mrn: string } | null;
  provider: { full_name: string | null; email: string } | null;
};

type ViewMode = "list" | "week";

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

// Week grid time window (local to the UI; data is UTC — tz-aware label rendering
// lands with the locations.timezone wiring).
const HOUR_START = 8;
const HOUR_END = 19;
const SLOTS_PER_HOUR = 4; // 15-min slots
const HEADER_ROW = 1;
const BODY_ROWS = (HOUR_END - HOUR_START) * SLOTS_PER_HOUR; // 44
const SLOT_HEIGHT_REM = 1.25;

function isoDateOnly(s: string | Date): string {
  const d = typeof s === "string" ? new Date(s) : s;
  return d.toISOString().slice(0, 10);
}

function formatTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** UTC Monday start of the ISO week containing `date`. */
function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun
  const mondayOffset = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return d;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildHref(params: { view: ViewMode; date: string; status?: string }): string {
  const sp = new URLSearchParams({
    view: params.view,
    date: params.date,
    ...(params.status ? { status: params.status } : {}),
  });
  return `/appointments?${sp.toString()}`;
}

export default async function AppointmentsListPage({
  searchParams,
}: {
  searchParams: Promise<AppointmentsSearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/appointments");
  }
  requirePermission(session, "schedule:read");

  const params = await searchParams;
  const view: ViewMode = params.view === "week" ? "week" : "list";
  const date = params.date ?? isoDateOnly(new Date());
  const statusFilter = params.status ?? "";
  const canWrite = session.permissions.includes("schedule:write");

  // Date range: a single day for list view, a full week for week view.
  const anchor = new Date(`${date}T00:00:00.000Z`);
  const rangeStart = view === "week" ? weekStart(anchor) : anchor;
  const rangeEnd = view === "week" ? addDays(rangeStart, 7) : addDays(rangeStart, 1);

  const supabase = await createVitalFlowServerClient();
  let q = supabase
    .from("appointments")
    .select(
      "id, patient_id, provider_id, start_at, end_at, status, reason, visit_type, " +
        "patient:patients!appointments_patient_id_fkey(given_name, family_name, mrn), " +
        "provider:profiles!appointments_provider_profile_fkey(full_name, email)",
    )
    .eq("tenant_id", session.tenantId)
    .gte("start_at", rangeStart.toISOString())
    .lt("start_at", rangeEnd.toISOString())
    .order("start_at", { ascending: true });

  if (statusFilter) {
    q = q.eq("status", statusFilter);
  }

  const { data: rowsRaw, error } = await q;
  const rows = (rowsRaw ?? []) as unknown as AppointmentRow[];

  const stepDays = view === "week" ? 7 : 1;
  const prevDate = isoDateOnly(addDays(rangeStart, -stepDays));
  const nextDate = isoDateOnly(addDays(rangeStart, stepDays));
  const todayDate = isoDateOnly(new Date());

  const title = view === "week" ? "Week of" : "Day of";
  const rangeLabel =
    view === "week" ? `${isoDateOnly(rangeStart)} – ${isoDateOnly(addDays(rangeStart, 6))}` : date;

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Home", href: "/" }, { label: "Appointments" }]}
      />
      <PageHeader
        eyebrow="Schedule"
        title="Appointments"
        description="Toggle between day list and week grid. Filter by status, or jump to another period."
        actions={
          canWrite ? (
            <Button asChild>
              <NextLink href={`/appointments/new?date=${date}`}>New appointment</NextLink>
            </Button>
          ) : null
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value={view} />
        <div className="min-w-[180px]">
          <FormField label="Date" htmlFor="date">
            <Input id="date" name="date" type="date" defaultValue={date} />
          </FormField>
        </div>
        <div className="min-w-[180px]">
          <FormField label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue={statusFilter}
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="">All</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="arrived">Arrived</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No show</option>
            </select>
          </FormField>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <div className="border-input inline-flex overflow-hidden rounded-md border">
            <NextLink
              href={buildHref({ view: "list", date, status: statusFilter })}
              className={`px-3 py-1.5 text-xs ${view === "list" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            >
              List
            </NextLink>
            <NextLink
              href={buildHref({ view: "week", date, status: statusFilter })}
              className={`px-3 py-1.5 text-xs ${view === "week" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            >
              Week
            </NextLink>
          </div>
          <Button asChild variant="outline" size="sm">
            <NextLink href={buildHref({ view, date: prevDate, status: statusFilter })}>
              ← Prev {view === "week" ? "week" : "day"}
            </NextLink>
          </Button>
          <Button asChild variant="outline" size="sm">
            <NextLink href={buildHref({ view, date: todayDate, status: statusFilter })}>
              Today
            </NextLink>
          </Button>
          <Button asChild variant="outline" size="sm">
            <NextLink href={buildHref({ view, date: nextDate, status: statusFilter })}>
              Next {view === "week" ? "week" : "day"} →
            </NextLink>
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            {title} {rangeLabel} ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Failed to load: {error.message}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title={view === "week" ? "No appointments this week" : "No appointments"}
              description={
                canWrite
                  ? "Nothing scheduled. Book a new appointment to get started."
                  : "Nothing scheduled for this period."
              }
              action={
                canWrite ? (
                  <Button asChild>
                    <NextLink href={`/appointments/new?date=${date}`}>New appointment</NextLink>
                  </Button>
                ) : undefined
              }
            />
          ) : view === "week" ? (
            <WeekGrid weekStart={rangeStart} appointments={rows} />
          ) : (
            <ListView rows={rows} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ---------- List view (unchanged from Slice 2) ------------------------------

function ListView({ rows }: { rows: readonly AppointmentRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((a) => (
          <TableRow key={a.id}>
            <TableCell className="font-mono text-xs">
              <NextLink href={`/appointments/${a.id}`} className="hover:underline">
                {formatTime(a.start_at)}–{formatTime(a.end_at)}
              </NextLink>
            </TableCell>
            <TableCell>
              {a.patient ? (
                <NextLink
                  href={`/patients/${a.patient_id}`}
                  className="font-medium hover:underline"
                >
                  {a.patient.given_name} {a.patient.family_name}
                </NextLink>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
              {a.patient ? (
                <div className="text-muted-foreground font-mono text-xs">{a.patient.mrn}</div>
              ) : null}
            </TableCell>
            <TableCell>{a.provider?.full_name ?? a.provider?.email ?? "—"}</TableCell>
            <TableCell className="text-sm">{a.reason ?? "—"}</TableCell>
            <TableCell className="text-xs">{a.visit_type ?? "in_person"}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANTS[a.status] ?? "default"}>
                {a.status.replace(/_/g, " ")}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------- Week grid -------------------------------------------------------

/**
 * Pure CSS-grid calendar. No client JS — appointments are block elements
 * positioned by `grid-column` (day) and `grid-row-start/end` (15-min slots).
 * Appointments entirely outside the 08:00–19:00 window are hidden; partially
 * outside appointments are clamped to the visible window.
 */
function WeekGrid({
  weekStart,
  appointments,
}: {
  weekStart: Date;
  appointments: readonly AppointmentRow[];
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = isoDateOnly(new Date());

  // Pre-group appointments per day for O(n) placement.
  const byDay = new Map<string, AppointmentRow[]>();
  for (const a of appointments) {
    const key = isoDateOnly(a.start_at);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(a);
  }

  const hourLabels = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  return (
    <div className="overflow-x-auto">
      <div
        className="border-border grid min-w-[720px] rounded-md border"
        style={{
          gridTemplateColumns: "72px repeat(7, 1fr)",
          gridTemplateRows: `32px repeat(${BODY_ROWS}, ${SLOT_HEIGHT_REM}rem)`,
        }}
      >
        {/* top-left corner */}
        <div className="border-border bg-muted/30 border-b border-r" />

        {/* day headers */}
        {days.map((d) => {
          const key = isoDateOnly(d);
          const isToday = key === todayKey;
          const label = d.toLocaleDateString(undefined, {
            weekday: "short",
            month: "numeric",
            day: "numeric",
          });
          return (
            <div
              key={key}
              className={`border-border bg-muted/30 border-b border-r px-2 py-1 text-xs font-medium ${
                isToday ? "text-primary" : ""
              }`}
            >
              {label}
            </div>
          );
        })}

        {/* hour labels (col 1) */}
        {hourLabels.slice(0, -1).map((h, i) => (
          <div
            key={`hour-${h}`}
            className="border-border text-muted-foreground border-r px-2 pt-0.5 text-right font-mono text-[10px]"
            style={{
              gridColumn: 1,
              gridRowStart: HEADER_ROW + 1 + i * SLOTS_PER_HOUR,
              gridRowEnd: HEADER_ROW + 1 + (i + 1) * SLOTS_PER_HOUR,
            }}
          >
            {String(h).padStart(2, "0")}:00
          </div>
        ))}

        {/* day column backgrounds (thin borders on hour ticks) */}
        {days.map((_d, colIdx) =>
          hourLabels.slice(0, -1).map((_h, i) => (
            <div
              key={`${colIdx}-bg-${i}`}
              className="border-border/40 border-r border-t"
              style={{
                gridColumn: colIdx + 2,
                gridRowStart: HEADER_ROW + 1 + i * SLOTS_PER_HOUR,
                gridRowEnd: HEADER_ROW + 1 + (i + 1) * SLOTS_PER_HOUR,
              }}
            />
          )),
        )}

        {/* appointments */}
        {days.flatMap((d, colIdx) => {
          const list = byDay.get(isoDateOnly(d)) ?? [];
          return list.map((a) => {
            const start = new Date(a.start_at);
            const end = new Date(a.end_at);

            const startMinuteOfDay = start.getUTCHours() * 60 + start.getUTCMinutes();
            const endMinuteOfDay = end.getUTCHours() * 60 + end.getUTCMinutes();
            const windowStart = HOUR_START * 60;
            const windowEnd = HOUR_END * 60;

            // Hide entirely-outside appointments.
            if (endMinuteOfDay <= windowStart || startMinuteOfDay >= windowEnd) {
              return null;
            }
            const clampedStart = Math.max(startMinuteOfDay, windowStart);
            const clampedEnd = Math.min(endMinuteOfDay, windowEnd);

            const rowStart = HEADER_ROW + 1 + Math.floor((clampedStart - windowStart) / 15);
            const rowEnd =
              HEADER_ROW +
              1 +
              Math.max(rowStart - HEADER_ROW, Math.ceil((clampedEnd - windowStart) / 15));

            const variant = STATUS_VARIANTS[a.status] ?? "default";
            const bg =
              variant === "success"
                ? "bg-success/15 border-success/40"
                : variant === "warning"
                  ? "bg-warning/15 border-warning/40"
                  : variant === "destructive"
                    ? "bg-destructive/10 border-destructive/40 opacity-70"
                    : variant === "muted"
                      ? "bg-muted border-border opacity-60"
                      : "bg-primary/10 border-primary/40";

            return (
              <NextLink
                key={a.id}
                href={`/appointments/${a.id}`}
                className={`hover:ring-primary/40 m-[2px] overflow-hidden rounded-md border p-1 text-[11px] leading-tight hover:ring-2 ${bg}`}
                style={{
                  gridColumn: colIdx + 2,
                  gridRowStart: rowStart,
                  gridRowEnd: rowEnd,
                }}
                title={`${a.patient?.given_name ?? ""} ${a.patient?.family_name ?? ""} — ${a.reason ?? ""}`}
              >
                <div className="text-muted-foreground font-mono text-[10px]">
                  {formatTime(a.start_at)}
                </div>
                <div className="truncate font-medium">
                  {a.patient ? `${a.patient.given_name} ${a.patient.family_name}` : "No patient"}
                </div>
                {a.reason ? <div className="text-muted-foreground truncate">{a.reason}</div> : null}
              </NextLink>
            );
          });
        })}
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        Showing {HOUR_START}:00–{HOUR_END}:00 UTC. Appointments outside this window hidden in grid
        view — switch to List to see everything.
      </p>
    </div>
  );
}
