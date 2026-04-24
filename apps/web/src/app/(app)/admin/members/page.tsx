import { logEventBestEffort } from "@vitalflow/auth/audit";
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

import { generateToken, hashToken } from "../../../../lib/invitations/tokens.js";
import { getSession } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

interface MembersSearchParams {
  ok?: string;
  error?: string;
  /** Raw invite token, surfaced once by inviteStaff() so the admin can copy the link. */
  token?: string;
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

type WritableInvitesTable = {
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
function invitesTable(c: SupabaseServerClient): WritableInvitesTable {
  return (c as unknown as { from: (t: string) => WritableInvitesTable }).from("invitations");
}

async function inviteStaff(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/admin/members");
  }
  requirePermission(session, "admin:users");

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const roles = formData.getAll("roles").map(String).filter(Boolean) as StaffRole[];

  if (!email.includes("@") || roles.length === 0) {
    redirect(
      `/admin/members?error=${encodeURIComponent(
        "Valid email and at least one role are required",
      )}`,
    );
  }

  // Block practice_owner grants unless the caller is already an owner — the DB
  // `enforce_owner_grant` trigger will also catch this, but a friendly pre-check
  // means a cleaner error message.
  if (
    roles.includes("practice_owner" as StaffRole) &&
    !session.roles.includes("practice_owner" as StaffRole)
  ) {
    redirect(
      `/admin/members?error=${encodeURIComponent("Only a practice owner can invite another owner")}`,
    );
  }

  const token = generateToken();
  const token_hash = hashToken(token);

  const supabase = await createVitalFlowServerClient();
  const { error } = await invitesTable(supabase).insert({
    tenant_id: session.tenantId,
    email,
    roles,
    token_hash,
    invited_by: session.userId,
    status: "pending",
  });
  if (error) {
    const friendly = error.message.includes("invitations_tenant_id_email_status_key")
      ? `There's already a pending invite for ${email}. Revoke it first to issue a new link.`
      : error.message;
    redirect(`/admin/members?error=${encodeURIComponent(friendly)}`);
  }

  await logEventBestEffort({
    tenantId: session.tenantId,
    actorId: session.userId,
    eventType: "member.invited",
    details: { invitee_email_domain: email.split("@")[1] ?? null, roles },
  });

  revalidatePath("/admin/members");
  redirect(
    `/admin/members?ok=${encodeURIComponent(
      `Invite created for ${email}. Copy the link below and send it out — it expires in 7 days.`,
    )}&token=${encodeURIComponent(token)}`,
  );
}

async function revokeInvite(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/admin/members");
  }
  requirePermission(session, "admin:users");

  const id = String(formData.get("id") ?? "");
  if (!id) {
    redirect(`/admin/members?error=${encodeURIComponent("Missing invite id")}`);
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await invitesTable(supabase)
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  if (error) {
    redirect(`/admin/members?error=${encodeURIComponent(error.message)}`);
  }

  await logEventBestEffort({
    tenantId: session.tenantId,
    actorId: session.userId,
    eventType: "member.invite_cancelled",
    targetTable: "invitations",
    targetRowId: id,
    details: {},
  });

  revalidatePath("/admin/members");
  redirect(`/admin/members?ok=${encodeURIComponent("Invite revoked")}`);
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
    .select(
      "id, user_id, roles, status, joined_at, deleted_at, profiles:profiles!tenant_members_user_profile_fkey(email, full_name)",
    )
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("joined_at", { ascending: true });
  const members = (membersRaw ?? []) as unknown as MemberRow[];

  type PendingInviteRow = {
    id: string;
    email: string;
    roles: StaffRole[];
    created_at: string;
    expires_at: string;
    invited_by: string;
  };
  const { data: invitesRaw } = await supabase
    .from("invitations")
    .select("id, email, roles, created_at, expires_at, invited_by")
    .eq("tenant_id", session.tenantId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const pendingInvites = (invitesRaw ?? []) as unknown as PendingInviteRow[];

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
        {params.token ? <InviteLinkBanner token={params.token} /> : null}

        <Card>
          <CardHeader>
            <CardTitle>Invite staff by email</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={inviteStaff} className="space-y-4">
              <FormField label="Email" htmlFor="email" required>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="off"
                  placeholder="newstaff@demo.clinic"
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
              <div className="flex items-start gap-3">
                <Button type="submit">Create invite</Button>
                <p className="text-muted-foreground text-xs leading-tight">
                  An invite link is generated with a 7-day expiry. Copy it and send by any channel
                  (email dispatch ships next sprint). The recipient sets their own password on first
                  sign-in.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending invitations ({pendingInvites.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingInvites.length === 0 ? (
              <p className="text-muted-foreground text-sm">No open invites.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {inv.roles.map((r) => (
                            <Badge key={r} variant="muted">
                              {r.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={revokeInvite}>
                          <input type="hidden" name="id" value={inv.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Revoke
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

/**
 * Shown ONCE after a successful inviteStaff action — the raw token is in the
 * URL query string, never persisted. Admin copies the link and sends it.
 */
function InviteLinkBanner({ token }: { token: string }) {
  const link = `/invitations/accept?token=${token}`;
  return (
    <div
      role="status"
      className="border-primary/30 bg-primary/5 space-y-2 rounded-md border p-3 text-sm"
    >
      <p className="font-medium">Copy this invite link:</p>
      <code className="bg-background block break-all rounded border border-slate-200 p-2 font-mono text-xs">
        {link}
      </code>
      <p className="text-muted-foreground text-xs">
        This link is shown once. Paste it into an email, Slack, or SMS to the new staff member.
        Anyone with the link can accept — treat it like a password.
      </p>
    </div>
  );
}
