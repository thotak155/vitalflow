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

const STATUS_VARIANTS: Record<string, "muted" | "success" | "warning" | "destructive" | "default"> = {
  scheduled: "default",
  confirmed: "success",
  arrived: "warning",
  in_progress: "warning",
  completed: "success",
  cancelled: "destructive",
  no_show: "destructive",
  rescheduled: "muted",
};

function isoDateOnly(s: string | Date): string {
  const d = typeof s === "string" ? new Date(s) : s;
  return d.toISOString().slice(0, 10);
}

function formatTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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
  const date = params.date ?? isoDateOnly(new Date());
  const statusFilter = params.status ?? "";

  // Day range: start-of-day to start-of-next-day in UTC. A timezone-aware
  // filter lives with the locations.timezone wiring later.
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const supabase = await createVitalFlowServerClient();
  let q = supabase
    .from("appointments")
    .select(
      "id, patient_id, provider_id, start_at, end_at, status, reason, visit_type, " +
        "patient:patient_id(given_name, family_name, mrn), " +
        "provider:provider_id(full_name, email)",
    )
    .eq("tenant_id", session.tenantId)
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString())
    .order("start_at", { ascending: true });

  if (statusFilter) {
    q = q.eq("status", statusFilter);
  }

  const { data: rowsRaw, error } = await q;
  const rows = (rowsRaw ?? []) as unknown as AppointmentRow[];

  const prevDate = isoDateOnly(new Date(dayStart.getTime() - 24 * 60 * 60 * 1000));
  const nextDate = isoDateOnly(new Date(dayStart.getTime() + 24 * 60 * 60 * 1000));
  const canWrite = session.permissions.includes("schedule:write");

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Home", href: "/" }, { label: "Appointments" }]}
      />
      <PageHeader
        eyebrow="Schedule"
        title="Appointments"
        description="Day view of appointments across providers. Filter by status, or jump to another day."
        actions={
          canWrite ? (
            <Button asChild>
              <NextLink href={`/appointments/new?date=${date}`}>New appointment</NextLink>
            </Button>
          ) : null
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
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
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm">
            <NextLink href={`/appointments?date=${prevDate}`}>← Prev day</NextLink>
          </Button>
          <Button asChild variant="outline" size="sm">
            <NextLink href={`/appointments?date=${isoDateOnly(new Date())}`}>Today</NextLink>
          </Button>
          <Button asChild variant="outline" size="sm">
            <NextLink href={`/appointments?date=${nextDate}`}>Next day →</NextLink>
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            {date} ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">Failed to load: {error.message}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No appointments"
              description={
                canWrite
                  ? "Nothing scheduled for this day. Book a new appointment to get started."
                  : "Nothing scheduled for this day."
              }
              action={
                canWrite ? (
                  <Button asChild>
                    <NextLink href={`/appointments/new?date=${date}`}>New appointment</NextLink>
                  </Button>
                ) : undefined
              }
            />
          ) : (
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
                        <div className="font-mono text-xs text-muted-foreground">
                          {a.patient.mrn}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {a.provider?.full_name ?? a.provider?.email ?? "—"}
                    </TableCell>
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
          )}
        </CardContent>
      </Card>
    </>
  );
}
