import { createVitalFlowAdminClient } from "@vitalflow/auth/admin";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vitalflow/ui";
import { AlertCircle, CheckCircle2 } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { PageHeader } from "@vitalflow/ui/patterns";
import type { StaffRole } from "@vitalflow/types";

import NextLink from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSession } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

interface MembersSearchParams {
  ok?: string;
  error?: string;
}

const ROLE_OPTIONS: readonly { value: StaffRole; label: string }[] = [
  { value: "practice_owner", label: "Practice owner" },
  { value: "office_admin", label: "Office admin" },
  { value: "physician", label: "Physician" },
  { value: "nurse_ma", label: "Nurse / MA" },
  { value: "scheduler", label: "Scheduler" },
  { value: "biller", label: "Biller" },
];

type MemberRow = {
  id: string;
  user_id: string;
  roles: StaffRole[] | null;
  status: string;
  joined_at: string;
  deleted_at: string | null;
  profiles?: {
    email: string;
    full_name: string | null;
  } | null;
};

// `SupabaseServerClient`'s generated Database types don't always re-infer row
// shapes through the `@supabase/ssr` wrapper's return type (same pattern used
// in lib/session.ts). Narrow the write path with a thin cast rather than
// polluting every call site.
type WritableMembersTable = {
  insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  update: (v: Record<string, unknown>) => {
    eq: (
      col: string,
      val: string,
    ) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};
function membersTable(c: SupabaseServerClient): WritableMembersTable {
  return (c as unknown as { from: (t: string) => WritableMembersTable }).from("tenant_members");
}

async function createMember(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/admin/members");
  }
  requirePermission(session, "admin:users");

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const roles = formData.getAll("roles").map(String).filter(Boolean) as StaffRole[];

  if (!email.includes("@") || password.length < 12 || roles.length === 0) {
    redirect(
      `/admin/members?error=${encodeURIComponent(
        "Valid email, 12+ char password, and at least one role are required",
      )}`,
    );
  }

  const admin = createVitalFlowAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || email, user_kind: "staff" },
  });
  if (createErr || !created.user) {
    redirect(
      `/admin/members?error=${encodeURIComponent(
        createErr?.message ?? "Failed to create auth user",
      )}`,
    );
  }

  // Insert the tenant_members row as the acting admin (respects RLS +
  // enforce_owner_grant trigger — they must be a practice_owner to grant
  // practice_owner; office_admin can only grant non-owner roles).
  const supabase = await createVitalFlowServerClient();
  const { error: memberErr } = await membersTable(supabase).insert({
    tenant_id: session.tenantId,
    user_id: created.user.id,
    roles,
    status: "active",
    invited_by: session.userId,
  });
  if (memberErr) {
    // Best effort: delete the auth user we just created so the operation
    // doesn't leave an orphan.
    await admin.auth.admin.deleteUser(created.user.id);
    redirect(`/admin/members?error=${encodeURIComponent(memberErr.message)}`);
  }

  revalidatePath("/admin/members");
  redirect(`/admin/members?ok=${encodeURIComponent(`Added ${email}`)}`);
}

async function updateRoles(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/admin/members");
  }
  requirePermission(session, "admin:users");

  const id = String(formData.get("id") ?? "");
  const roles = formData.getAll("roles").map(String).filter(Boolean) as StaffRole[];
  if (!id || roles.length === 0) {
    redirect(`/admin/members?error=${encodeURIComponent("At least one role is required")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await membersTable(supabase)
    .update({ roles })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/admin/members?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/members");
  redirect(`/admin/members?ok=${encodeURIComponent("Roles updated")}`);
}

async function removeMember(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/admin/members");
  }
  requirePermission(session, "admin:users");

  const id = String(formData.get("id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!id || userId === session.userId) {
    redirect(
      `/admin/members?error=${encodeURIComponent(
        userId === session.userId ? "You can't remove your own membership" : "Invalid member id",
      )}`,
    );
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await membersTable(supabase)
    .update({ deleted_at: new Date().toISOString(), status: "removed" })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/admin/members?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/members");
  redirect(`/admin/members?ok=${encodeURIComponent("Member removed")}`);
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<MembersSearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/admin/members");
  }
  requirePermission(session, "admin:users");

  const params = await searchParams;
  const supabase = await createVitalFlowServerClient();
  const { data: membersRaw, error } = await supabase
    .from("tenant_members")
    .select("id, user_id, roles, status, joined_at, deleted_at, profiles:user_id(email, full_name)")
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("joined_at", { ascending: true });
  const members = (membersRaw ?? []) as unknown as MemberRow[];

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Admin", href: "/admin" }, { label: "Members" }]}
      />
      <PageHeader
        eyebrow="Tenant"
        title="Members"
        description="Invite, edit roles, or remove staff in this practice. Changes take effect on the user's next request."
      />

      {params.ok ? (
        <div
          role="status"
          className="border-success/30 bg-success/5 mb-4 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{params.ok}</span>
        </div>
      ) : null}
      {params.error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 mb-4 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{params.error}</span>
        </div>
      ) : null}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add a member</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createMember} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Email" htmlFor="email" required>
                  <Input id="email" name="email" type="email" required autoComplete="off" />
                </FormField>
                <FormField label="Full name" htmlFor="full_name">
                  <Input id="full_name" name="full_name" type="text" autoComplete="off" />
                </FormField>
              </div>
              <FormField
                label="Temporary password"
                htmlFor="password"
                required
                helper="Share out-of-band. The user can change it after sign in."
              >
                <Input
                  id="password"
                  name="password"
                  type="text"
                  minLength={12}
                  required
                  autoComplete="off"
                />
              </FormField>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Roles</legend>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {ROLE_OPTIONS.map((r) => (
                    <label
                      key={r.value}
                      className="border-input bg-background flex items-center gap-2 rounded-md border p-2 text-sm"
                    >
                      <input type="checkbox" name="roles" value={r.value} />
                      {r.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button type="submit">Create member</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing members ({members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-destructive text-sm">Failed to load: {error.message}</p>
            ) : members.length === 0 ? (
              <p className="text-muted-foreground text-sm">No members yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name / Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="font-medium">{m.profiles?.full_name ?? "—"}</div>
                        <div className="text-muted-foreground text-xs">
                          {m.profiles?.email ?? m.user_id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(m.roles ?? []).map((r) => (
                            <Badge key={r} variant="muted">
                              {r.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.status === "active" ? "success" : "muted"}>
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(m.joined_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <details className="group">
                            <summary className="text-primary cursor-pointer text-xs hover:underline">
                              Edit roles
                            </summary>
                            <form
                              action={updateRoles}
                              className="mt-2 flex flex-wrap items-center gap-2"
                            >
                              <input type="hidden" name="id" value={m.id} />
                              {ROLE_OPTIONS.map((r) => (
                                <label key={r.value} className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    name="roles"
                                    value={r.value}
                                    defaultChecked={m.roles?.includes(r.value) ?? false}
                                  />
                                  {r.label}
                                </label>
                              ))}
                              <Button type="submit" size="sm" variant="outline">
                                Save
                              </Button>
                            </form>
                          </details>
                          {m.user_id !== session.userId ? (
                            <form action={removeMember}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="user_id" value={m.user_id} />
                              <Button type="submit" size="sm" variant="destructive">
                                Remove
                              </Button>
                            </form>
                          ) : null}
                        </div>
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
