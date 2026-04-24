import { createVitalFlowAdminClient } from "@vitalflow/auth/admin";
import { logEventBestEffort } from "@vitalflow/auth/audit";
import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import { Button, Card, CardContent, CardHeader, CardTitle, FormField, Input } from "@vitalflow/ui";
import { AlertCircle, CheckCircle2, HeartPulse } from "@vitalflow/ui/icons";
import { redirect } from "next/navigation";

import { hashToken } from "../../../../lib/invitations/tokens.js";

export const dynamic = "force-dynamic";

interface AcceptSearchParams {
  token?: string;
  error?: string;
}

interface InvitationRow {
  id: string;
  tenant_id: string;
  email: string;
  roles: string[];
  status: string;
  expires_at: string;
  accepted_at: string | null;
}

async function findInvitation(rawToken: string): Promise<InvitationRow | null> {
  const admin = createVitalFlowAdminClient();
  const hash = hashToken(rawToken);
  // Use the service-role client: there's no session yet, so RLS on
  // `public.invitations` would otherwise reject the select.
  const client = admin as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (
          c: string,
          v: string,
        ) => {
          maybeSingle: () => Promise<{ data: InvitationRow | null; error: unknown }>;
        };
      };
    };
  };
  const { data } = await client
    .from("invitations")
    .select("id, tenant_id, email, roles, status, expires_at, accepted_at")
    .eq("token_hash", hash)
    .maybeSingle();
  return data;
}

async function acceptInvitation(formData: FormData): Promise<void> {
  "use server";
  const rawToken = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!rawToken) {
    redirect(`/login?error=${encodeURIComponent("Missing invite token")}`);
  }
  if (password.length < 12) {
    redirect(
      `/invitations/accept?token=${encodeURIComponent(rawToken)}&error=${encodeURIComponent(
        "Password must be at least 12 characters",
      )}`,
    );
  }
  if (password !== confirm) {
    redirect(
      `/invitations/accept?token=${encodeURIComponent(rawToken)}&error=${encodeURIComponent(
        "Passwords don't match",
      )}`,
    );
  }

  const invite = await findInvitation(rawToken);
  if (!invite) {
    redirect(`/login?error=${encodeURIComponent("Invite not found — ask your admin to reissue")}`);
  }
  if (invite.status !== "pending") {
    redirect(
      `/login?error=${encodeURIComponent(
        invite.status === "accepted"
          ? "This invite has already been accepted — sign in normally"
          : `Invite is ${invite.status}`,
      )}`,
    );
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    redirect(`/login?error=${encodeURIComponent("Invite expired — ask your admin to reissue")}`);
  }

  const admin = createVitalFlowAdminClient();

  // Reuse an existing auth user if one already exists for this email (staff
  // moving between tenants) — otherwise create.
  type AdminUsersListResp = {
    data?: { users?: Array<{ id: string; email?: string | null }> } | null;
    error?: { message: string } | null;
  };
  const list = (await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })) as unknown as AdminUsersListResp;
  const existing = list.data?.users?.find(
    (u) => u.email?.toLowerCase() === invite.email.toLowerCase(),
  );

  let userId: string;
  if (existing) {
    userId = existing.id;
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (error) {
      redirect(
        `/invitations/accept?token=${encodeURIComponent(rawToken)}&error=${encodeURIComponent(
          error.message,
        )}`,
      );
    }
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || invite.email, user_kind: "staff" },
    });
    if (error || !created.user) {
      redirect(
        `/invitations/accept?token=${encodeURIComponent(rawToken)}&error=${encodeURIComponent(
          error?.message ?? "Failed to create account",
        )}`,
      );
    }
    userId = created.user.id;
  }

  // Create the tenant_members row (service-role — no session yet).
  type InsertTable = {
    insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
  const adminWrite = admin as unknown as { from: (t: string) => InsertTable };
  const memberIns = await adminWrite.from("tenant_members").insert({
    tenant_id: invite.tenant_id,
    user_id: userId,
    roles: invite.roles,
    status: "active",
    invited_by: null,
  });
  if (memberIns.error && !memberIns.error.message.includes("duplicate")) {
    redirect(
      `/invitations/accept?token=${encodeURIComponent(rawToken)}&error=${encodeURIComponent(
        memberIns.error.message,
      )}`,
    );
  }

  // Mark invitation accepted.
  type UpdateTable = {
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
  const adminUpdate = admin as unknown as { from: (t: string) => UpdateTable };
  await adminUpdate
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  await logEventBestEffort({
    tenantId: invite.tenant_id,
    actorId: userId,
    eventType: "member.invite_accepted",
    targetTable: "invitations",
    targetRowId: invite.id,
    details: { roles: invite.roles },
  });

  // Sign in the new user in THIS session so they land on the dashboard.
  const supabase = await createVitalFlowServerClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password,
  });
  if (signInErr) {
    redirect(`/login?ok=${encodeURIComponent("Account ready — please sign in")}`);
  }
  redirect("/");
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<AcceptSearchParams>;
}) {
  const params = await searchParams;
  const rawToken = params.token;
  const error = params.error;

  if (!rawToken) {
    return (
      <Card className="shadow-vf-md">
        <CardHeader className="items-center text-center">
          <div className="text-primary flex items-center gap-2">
            <HeartPulse className="h-6 w-6" aria-hidden />
            <span className="text-lg font-semibold tracking-tight">VitalFlow</span>
          </div>
          <CardTitle>Invite link missing</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            The link you followed doesn&rsquo;t carry an invite token. Ask your administrator to
            send a fresh link.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Validate BEFORE rendering the form so expired / revoked links don't look
  // live. We read via service role since there's no session.
  const invite = await findInvitation(rawToken);
  const expired = invite && new Date(invite.expires_at).getTime() < Date.now();
  const invalid = !invite || invite.status !== "pending" || expired || invite.accepted_at !== null;

  if (invalid) {
    return (
      <Card className="shadow-vf-md">
        <CardHeader className="items-center text-center">
          <div className="text-primary flex items-center gap-2">
            <HeartPulse className="h-6 w-6" aria-hidden />
            <span className="text-lg font-semibold tracking-tight">VitalFlow</span>
          </div>
          <CardTitle>This invite can&rsquo;t be used</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {!invite
              ? "We couldn't find that invite. The link may have been copied incorrectly."
              : invite.status === "accepted"
                ? "This invite has already been accepted — please sign in normally."
                : expired
                  ? "This invite has expired. Ask your administrator to issue a fresh one."
                  : `Status: ${invite.status}.`}
          </p>
          <Button asChild variant="outline">
            <a href="/login">Go to sign-in</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-vf-md">
      <CardHeader className="items-center text-center">
        <div className="text-primary flex items-center gap-2">
          <HeartPulse className="h-6 w-6" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">VitalFlow</span>
        </div>
        <CardTitle>Accept invitation</CardTitle>
        <p className="text-muted-foreground text-sm">
          You&rsquo;ve been invited as <span className="font-medium">{invite.email}</span>. Pick a
          password to finish setting up your account.
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 className="text-success h-3 w-3" aria-hidden />
          Roles: {invite.roles.join(", ")}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-foreground flex items-start gap-2 rounded-md border p-3 text-sm"
          >
            <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}
        <form action={acceptInvitation} className="space-y-4">
          <input type="hidden" name="token" value={rawToken} />
          <FormField label="Full name" htmlFor="full_name" helper="Optional — shown in audit logs.">
            <Input id="full_name" name="full_name" type="text" autoComplete="name" />
          </FormField>
          <FormField label="Password" htmlFor="password" required>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </FormField>
          <FormField label="Confirm password" htmlFor="confirm" required>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </FormField>
          <Button type="submit" className="w-full">
            Accept &amp; sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
