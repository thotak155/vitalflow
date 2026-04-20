import { requirePermission } from "@vitalflow/auth/rbac";
import {
  createVitalFlowServerClient,
  type SupabaseServerClient,
} from "@vitalflow/auth/server";
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
import { AlertCircle, CheckCircle2 } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { EmptyState, PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSession } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

interface SP {
  ok?: string;
  error?: string;
}

type PayerRow = {
  id: string;
  name: string;
  payer_code: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
};

type WritablePayersTable = {
  insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  update: (v: Record<string, unknown>) => {
    eq: (c: string, v: string) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};
function payersTable(c: SupabaseServerClient): WritablePayersTable {
  return (c as unknown as { from: (t: string) => WritablePayersTable }).from("payers");
}

async function createPayer(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login?next=/admin/payers");
  requirePermission(session, "admin:billing_config");

  const name = String(formData.get("name") ?? "").trim();
  const payerCode = String(formData.get("payer_code") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) {
    redirect(`/admin/payers?error=${encodeURIComponent("Payer name is required")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await payersTable(supabase).insert({
    tenant_id: session.tenantId,
    name,
    payer_code: payerCode || null,
    phone: phone || null,
    active: true,
  });
  if (error) {
    redirect(`/admin/payers?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/payers");
  redirect(`/admin/payers?ok=${encodeURIComponent(`Added ${name}`)}`);
}

async function togglePayerActive(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");
  requirePermission(session, "admin:billing_config");

  const id = String(formData.get("id") ?? "");
  const next = formData.get("active") === "1";
  if (!id) {
    redirect(`/admin/payers?error=${encodeURIComponent("Missing payer id")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await payersTable(supabase)
    .update({ active: next })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/admin/payers?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/payers");
  redirect(`/admin/payers?ok=${encodeURIComponent(next ? "Payer activated" : "Payer deactivated")}`);
}

export default async function PayersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin/payers");
  requirePermission(session, "admin:billing_config");

  const sp = await searchParams;

  const supabase = await createVitalFlowServerClient();
  const { data: rowsRaw, error } = await supabase
    .from("payers")
    .select("id, name, payer_code, phone, active, created_at")
    .eq("tenant_id", session.tenantId)
    .order("name", { ascending: true });
  const rows = (rowsRaw ?? []) as unknown as PayerRow[];

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Admin", href: "/admin" }, { label: "Payers" }]}
      />
      <PageHeader
        eyebrow="Billing"
        title="Payers"
        description="Insurance companies and billing counterparties. Payers are referenced from patient coverages and claims."
      />

      {sp.ok ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          <span>{sp.ok}</span>
        </div>
      ) : null}
      {sp.error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span>{sp.error}</span>
        </div>
      ) : null}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add payer</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createPayer} className="grid gap-3 md:grid-cols-[2fr,1fr,1fr,auto]">
              <FormField label="Name" htmlFor="name" required>
                <Input id="name" name="name" required placeholder="BlueCross BlueShield" />
              </FormField>
              <FormField label="Payer code" htmlFor="payer_code" helper="EDI / CMS payer id.">
                <Input id="payer_code" name="payer_code" placeholder="BCBS" />
              </FormField>
              <FormField label="Phone" htmlFor="phone">
                <Input id="phone" name="phone" placeholder="(555) 000-0000" />
              </FormField>
              <div className="flex items-end">
                <Button type="submit">Add</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payers ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">Failed to load: {error.message}</p>
            ) : rows.length === 0 ? (
              <EmptyState
                title="No payers yet"
                description="Add a payer above so it becomes selectable when adding patient coverages."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs">{p.payer_code ?? "—"}</TableCell>
                      <TableCell className="text-xs">{p.phone ?? "—"}</TableCell>
                      <TableCell>
                        {p.active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="muted">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={togglePayerActive} className="inline">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                          <Button type="submit" variant="outline" size="sm">
                            {p.active ? "Deactivate" : "Activate"}
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
