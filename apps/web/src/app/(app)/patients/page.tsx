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

const PAGE_SIZE = 25;

interface PatientsSearchParams {
  q?: string;
  page?: string;
}

type PatientRow = {
  id: string;
  mrn: string;
  given_name: string;
  family_name: string;
  preferred_name: string | null;
  date_of_birth: string;
  sex_at_birth: string;
  deceased_at: string | null;
};

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

export default async function PatientsListPage({
  searchParams,
}: {
  searchParams: Promise<PatientsSearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/patients");
  }
  requirePermission(session, "patient:read");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createVitalFlowServerClient();
  let query = supabase
    .from("patients")
    .select("id, mrn, given_name, family_name, preferred_name, date_of_birth, sex_at_birth, deceased_at", {
      count: "exact",
    })
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("family_name", { ascending: true })
    .range(from, to);

  if (q) {
    // Match by name or MRN. `or()` accepts a PostgREST filter string.
    query = query.or(
      `family_name.ilike.%${q}%,given_name.ilike.%${q}%,preferred_name.ilike.%${q}%,mrn.ilike.%${q}%`,
    );
  }

  const { data: rowsRaw, count, error } = await query;
  const rows = (rowsRaw ?? []) as unknown as PatientRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Home", href: "/" }, { label: "Patients" }]}
      />
      <PageHeader
        eyebrow="Clinical"
        title="Patients"
        description="Search the patient master. Create a new chart or open one to review, update contacts, and see encounters."
        actions={
          <Button asChild>
            <NextLink href="/patients/new">New patient</NextLink>
          </Button>
        }
      />

      <form method="get" className="mb-4 flex gap-2">
        <div className="flex-1">
          <FormField label="Search" htmlFor="q" helper="By name, preferred name, or MRN.">
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Smith, Alex, MRN-1001…" />
          </FormField>
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="outline">
            Search
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            {q ? `Results for “${q}”` : "All patients"} ({total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">Failed to load: {error.message}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title={q ? "No matches" : "No patients yet"}
              description={
                q
                  ? "Try a different search term, or create a new chart."
                  : "Create your first patient chart to get started."
              }
              action={
                <Button asChild>
                  <NextLink href="/patients/new">New patient</NextLink>
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>MRN</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>DOB (age)</TableHead>
                    <TableHead>Sex</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => {
                    const displayName =
                      p.preferred_name
                        ? `${p.preferred_name} (${p.given_name}) ${p.family_name}`
                        : `${p.given_name} ${p.family_name}`;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">
                          <NextLink href={`/patients/${p.id}`} className="hover:underline">
                            {p.mrn}
                          </NextLink>
                        </TableCell>
                        <TableCell>
                          <NextLink href={`/patients/${p.id}`} className="font-medium hover:underline">
                            {displayName}
                          </NextLink>
                        </TableCell>
                        <TableCell>
                          {p.date_of_birth} ({calcAge(p.date_of_birth)})
                        </TableCell>
                        <TableCell className="capitalize">{p.sex_at_birth}</TableCell>
                        <TableCell>
                          {p.deceased_at ? (
                            <Badge variant="muted">Deceased</Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 ? (
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    {page > 1 ? (
                      <Button asChild variant="outline" size="sm">
                        <NextLink
                          href={`/patients?${new URLSearchParams({
                            ...(q ? { q } : {}),
                            page: String(page - 1),
                          }).toString()}`}
                        >
                          Previous
                        </NextLink>
                      </Button>
                    ) : null}
                    {page < totalPages ? (
                      <Button asChild variant="outline" size="sm">
                        <NextLink
                          href={`/patients?${new URLSearchParams({
                            ...(q ? { q } : {}),
                            page: String(page + 1),
                          }).toString()}`}
                        >
                          Next
                        </NextLink>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
