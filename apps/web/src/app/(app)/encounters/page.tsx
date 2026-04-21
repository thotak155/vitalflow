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

interface EncountersSearchParams {
  mine?: string;
  status?: string;
}

type EncounterRow = {
  id: string;
  patient_id: string;
  provider_id: string;
  status: string;
  start_at: string;
  end_at: string | null;
  reason: string | null;
  chief_complaint: string | null;
  patient: { given_name: string; family_name: string; mrn: string } | null;
  provider: { full_name: string | null; email: string } | null;
};

const STATUS_VARIANTS: Record<string, "muted" | "success" | "warning" | "destructive" | "default"> =
  {
    planned: "default",
    arrived: "warning",
    in_progress: "warning",
    finished: "success",
    cancelled: "destructive",
  };

export default async function EncountersListPage({
  searchParams,
}: {
  searchParams: Promise<EncountersSearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/encounters");
  }
  requirePermission(session, "clinical:read");

  const params = await searchParams;
  const mineOnly = params.mine !== "0"; // default: my encounters
  const statusFilter = params.status ?? "";

  const supabase = await createVitalFlowServerClient();
  let q = supabase
    .from("encounters")
    .select(
      "id, patient_id, provider_id, status, start_at, end_at, reason, chief_complaint, " +
        "patient:patients!encounters_patient_id_fkey(given_name, family_name, mrn)",
    )
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("start_at", { ascending: false })
    .limit(100);

  if (mineOnly) {
    q = q.eq("provider_id", session.userId);
  }
  if (statusFilter) {
    q = q.eq("status", statusFilter);
  }

  const { data: rowsRaw, error } = await q;
  const baseRows = (rowsRaw ?? []) as unknown as Omit<EncounterRow, "provider">[];

  // Provider display fields live on public.profiles; fetch those separately
  // and merge in to avoid cross-FK disambiguation in PostgREST.
  const providerIds = Array.from(new Set(baseRows.map((r) => r.provider_id).filter(Boolean)));
  const providerMap = new Map<string, { full_name: string | null; email: string }>();
  if (providerIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", providerIds);
    type ProfileRow = { id: string; full_name: string | null; email: string };
    for (const p of (profs as ProfileRow[] | null) ?? []) {
      providerMap.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }
  const rows: EncounterRow[] = baseRows.map((r) => ({
    ...r,
    provider: providerMap.get(r.provider_id) ?? null,
  }));

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Home", href: "/" }, { label: "Encounters" }]}
      />
      <PageHeader
        eyebrow="Clinical"
        title="Encounters"
        description="Open or in-progress visits and signed notes across your panel."
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <FormField label="Scope" htmlFor="mine">
            <select
              id="mine"
              name="mine"
              defaultValue={mineOnly ? "1" : "0"}
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="1">My encounters</option>
              <option value="0">All providers</option>
            </select>
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
              <option value="planned">Planned</option>
              <option value="arrived">Arrived</option>
              <option value="in_progress">In progress</option>
              <option value="finished">Finished</option>
            </select>
          </FormField>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            {mineOnly ? "My encounters" : "All encounters"} ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Failed to load: {error.message}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No encounters"
              description="Encounters open when a visit starts. Confirm an appointment to arrived, then start the visit."
              action={
                <Button asChild variant="outline">
                  <NextLink href="/appointments">Go to appointments</NextLink>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">
                      <NextLink href={`/encounters/${e.id}`} className="hover:underline">
                        {new Date(e.start_at).toLocaleString()}
                      </NextLink>
                    </TableCell>
                    <TableCell>
                      {e.patient ? (
                        <NextLink
                          href={`/patients/${e.patient_id}`}
                          className="font-medium hover:underline"
                        >
                          {e.patient.given_name} {e.patient.family_name}
                        </NextLink>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {e.patient ? (
                        <div className="text-muted-foreground font-mono text-xs">
                          {e.patient.mrn}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{e.provider?.full_name ?? e.provider?.email ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {e.chief_complaint ?? e.reason ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[e.status] ?? "default"}>
                        {e.status.replace(/_/g, " ")}
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
