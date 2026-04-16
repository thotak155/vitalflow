import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { DataTable, PageHeader, type DataTableColumn } from "@vitalflow/ui/patterns";
import NextLink from "next/link";

interface PatientRow {
  id: string;
  mrn: string;
  name: string;
  dob: string;
  lastVisit: string;
  status: "active" | "follow_up" | "inactive";
}

const patients: readonly PatientRow[] = [
  { id: "1", mrn: "MRN-1002", name: "Alex Morgan",    dob: "1985-03-14", lastVisit: "2026-04-02", status: "active" },
  { id: "2", mrn: "MRN-1003", name: "Priya Shah",     dob: "1972-11-09", lastVisit: "2026-03-28", status: "follow_up" },
  { id: "3", mrn: "MRN-1004", name: "Samuel Okafor",  dob: "1990-06-21", lastVisit: "2026-01-15", status: "inactive" },
];

const columns: readonly DataTableColumn<PatientRow>[] = [
  { id: "mrn", header: "MRN", width: "w-32", cell: (r) => <span className="font-mono text-xs">{r.mrn}</span> },
  { id: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
  { id: "dob", header: "DOB", cell: (r) => r.dob },
  { id: "last", header: "Last visit", cell: (r) => r.lastVisit },
  {
    id: "status",
    header: "Status",
    align: "right",
    cell: (r) => {
      const variant = r.status === "active" ? "success" : r.status === "follow_up" ? "warning" : "muted";
      const label = r.status === "follow_up" ? "Follow-up" : r.status[0]!.toUpperCase() + r.status.slice(1);
      return <Badge variant={variant}>{label}</Badge>;
    },
  },
];

export default function ProviderHomePage() {
  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Home", href: "/" }, { label: "Dashboard" }]}
      />
      <PageHeader
        eyebrow="Today"
        title="Good morning, Dr. Rivera"
        description="Here's a snapshot of your patients and pending work."
        actions={<Button>New encounter</Button>}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Open encounters</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">7</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Unsigned notes</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">3</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Critical results</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold text-destructive">1</div></CardContent>
        </Card>
      </div>
      <section aria-labelledby="recent-patients">
        <h2 id="recent-patients" className="mb-3 text-lg font-semibold">Recent patients</h2>
        <DataTable
          data={patients}
          columns={columns}
          rowKey={(r) => r.id}
          emptyTitle="No patients yet"
          emptyDescription="When you see patients, they'll show up here."
        />
      </section>
    </>
  );
}
