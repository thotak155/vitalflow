import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { DataTable, PageHeader, type DataTableColumn } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "../../lib/session.js";

export const dynamic = "force-dynamic";

interface PatientRow {
  id: string;
  mrn: string;
  name: string;
  dob: string | null;
  lastUpdated: string;
}

interface DashboardData {
  openEncounters: number;
  unsignedNotes: number;
  scheduledToday: number;
  recentPatients: readonly PatientRow[];
}

async function getDashboardData(tenantId: string): Promise<DashboardData> {
  const supabase = await createVitalFlowServerClient();
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [openEnc, unsigned, today, recent] = await Promise.all([
    supabase
      .from("encounters")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["planned", "arrived", "in_progress"])
      .is("deleted_at", null),
    supabase
      .from("encounter_notes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["draft", "pending_review"]),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("cancelled_at", null)
      .gte("start_at", dayStart.toISOString())
      .lt("start_at", dayEnd.toISOString()),
    supabase
      .from("patients")
      .select("id, mrn, given_name, family_name, date_of_birth, updated_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  type PatientRowDb = {
    id: string;
    mrn: string;
    given_name: string;
    family_name: string;
    date_of_birth: string | null;
    updated_at: string;
  };
  const rows = (recent.data as PatientRowDb[] | null) ?? [];

  return {
    openEncounters: openEnc.count ?? 0,
    unsignedNotes: unsigned.count ?? 0,
    scheduledToday: today.count ?? 0,
    recentPatients: rows.map((r) => ({
      id: r.id,
      mrn: r.mrn,
      name: `${r.given_name} ${r.family_name}`.trim(),
      dob: r.date_of_birth,
      lastUpdated: r.updated_at,
    })),
  };
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstNameFrom(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "there";
  // Profiles whose full_name defaults to the email address — show the local
  // part, capitalised, instead of the whole "name@domain.com" string.
  if (trimmed.includes("@") && !trimmed.includes(" ")) {
    const local = trimmed.split("@")[0] ?? "there";
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  const parts = trimmed.split(/\s+/);
  if (parts[0]?.match(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?)$/i) && parts.length > 1) {
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }
  return parts[0] ?? "there";
}

const columns: readonly DataTableColumn<PatientRow>[] = [
  {
    id: "mrn",
    header: "MRN",
    width: "w-32",
    cell: (r) => <span className="font-mono text-xs">{r.mrn}</span>,
  },
  {
    id: "name",
    header: "Name",
    cell: (r) => (
      <NextLink href={`/patients/${r.id}`} className="font-medium text-sky-700 hover:underline">
        {r.name}
      </NextLink>
    ),
  },
  { id: "dob", header: "DOB", cell: (r) => r.dob ?? "—" },
  { id: "last", header: "Last updated", cell: (r) => r.lastUpdated.slice(0, 10) },
];

export default async function ProviderHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await getDashboardData(session.tenantId);
  const greeting = greetingFor(new Date());

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Home", href: "/" }, { label: "Dashboard" }]}
      />
      <PageHeader
        eyebrow="Today"
        title={`${greeting}, ${firstNameFrom(session.displayName)}`}
        description="Here's a snapshot of your patients and pending work."
        actions={
          <Button asChild>
            <NextLink href="/encounters">New encounter</NextLink>
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Open encounters" value={data.openEncounters} href="/encounters" />
        <KpiCard label="Unsigned notes" value={data.unsignedNotes} href="/encounters" />
        <KpiCard label="Scheduled today" value={data.scheduledToday} href="/appointments" />
      </div>
      <section aria-labelledby="recent-patients">
        <h2 id="recent-patients" className="mb-3 text-lg font-semibold">
          Recent patients
        </h2>
        <DataTable
          data={data.recentPatients}
          columns={columns}
          rowKey={(r) => r.id}
          emptyTitle="No patients yet"
          emptyDescription="When you see patients, they'll show up here."
        />
      </section>
    </>
  );
}

function KpiCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <NextLink
      href={href}
      className="focus-visible:ring-primary block rounded-lg focus:outline-none focus-visible:ring-2"
    >
      <Card className="transition hover:border-slate-300 hover:shadow-sm">
        <CardHeader>
          <CardTitle>{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{value}</div>
        </CardContent>
      </Card>
    </NextLink>
  );
}
