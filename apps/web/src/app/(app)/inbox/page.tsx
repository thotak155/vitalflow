import { createVitalFlowServerClient, type SupabaseServerClient } from "@vitalflow/auth/server";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";
import { Inbox as InboxIcon } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { EmptyState, PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "../../../lib/session.js";

export const dynamic = "force-dynamic";

interface InboxSearchParams {
  scope?: "unread" | "all";
}

type NotificationRow = {
  id: string;
  subject: string | null;
  body_text: string | null;
  template_key: string | null;
  template_data: Record<string, unknown>;
  status: string;
  read_at: string | null;
  created_at: string;
};

// The generated Database types don't flow through @supabase/ssr's server
// client cleanly. Narrow the write shapes inline — same pattern used in the
// patient + admin pages.
type WritableNotificationsById = {
  update: (v: Record<string, unknown>) => {
    eq: (
      c: string,
      v: string,
    ) => {
      eq: (
        c: string,
        v: string,
      ) => {
        eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};
type WritableNotificationsAll = {
  update: (v: Record<string, unknown>) => {
    eq: (
      c: string,
      v: string,
    ) => {
      eq: (
        c: string,
        v: string,
      ) => {
        is: (c: string, v: null) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};

function notificationsByIdTable(c: SupabaseServerClient): WritableNotificationsById {
  return (c as unknown as { from: (t: string) => WritableNotificationsById }).from("notifications");
}
function notificationsAllTable(c: SupabaseServerClient): WritableNotificationsAll {
  return (c as unknown as { from: (t: string) => WritableNotificationsAll }).from("notifications");
}

async function markRead(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createVitalFlowServerClient();
  await notificationsByIdTable(supabase)
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .eq("recipient_id", session.userId);

  revalidatePath("/inbox");
}

async function markAllRead(): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createVitalFlowServerClient();
  await notificationsAllTable(supabase)
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", session.tenantId)
    .eq("recipient_id", session.userId)
    .is("read_at", null);

  revalidatePath("/inbox");
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<InboxSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/inbox");

  const params = await searchParams;
  const scope = params.scope === "all" ? "all" : "unread";

  const supabase = await createVitalFlowServerClient();
  let q = supabase
    .from("notifications")
    .select("id, subject, body_text, template_key, template_data, status, read_at, created_at")
    .eq("tenant_id", session.tenantId)
    .eq("recipient_id", session.userId)
    .eq("channel", "in_app")
    .order("created_at", { ascending: false })
    .limit(100);

  if (scope === "unread") {
    q = q.is("read_at", null);
  }

  const { data: rowsRaw, error } = await q;
  const rows = (rowsRaw ?? []) as unknown as NotificationRow[];

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", session.tenantId)
    .eq("recipient_id", session.userId)
    .eq("channel", "in_app")
    .is("read_at", null);

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Home", href: "/" }, { label: "Inbox" }]}
      />
      <PageHeader
        eyebrow="Work"
        title="Inbox"
        description="Messages addressed to you — workflow alerts, patient replies, escalations."
        actions={
          unreadCount && unreadCount > 0 ? (
            <form action={markAllRead}>
              <Button type="submit" variant="outline" size="sm">
                Mark all as read
              </Button>
            </form>
          ) : null
        }
      />

      <div className="mb-4 flex gap-2 text-sm">
        <NextLink
          href="/inbox?scope=unread"
          className={`rounded-full px-3 py-1 ${
            scope === "unread"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 text-slate-700"
          }`}
        >
          Unread {unreadCount ? `(${unreadCount})` : ""}
        </NextLink>
        <NextLink
          href="/inbox?scope=all"
          className={`rounded-full px-3 py-1 ${
            scope === "all" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-700"
          }`}
        >
          All
        </NextLink>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {scope === "unread" ? "Unread" : "All notifications"} ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Failed to load: {error.message}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title={scope === "unread" ? "Inbox zero" : "Nothing here yet"}
              description={
                scope === "unread"
                  ? "You're caught up. New workflow alerts and replies will show here."
                  : "When the system sends you in-app notifications, they'll appear here."
              }
            />
          ) : (
            <ul className="divide-y">
              {rows.map((n) => (
                <li key={n.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!n.read_at ? (
                          <span
                            aria-hidden
                            className="inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500"
                          />
                        ) : null}
                        <p
                          className={`truncate text-sm ${
                            n.read_at ? "text-slate-700" : "font-semibold text-slate-900"
                          }`}
                        >
                          {n.subject ?? n.template_key ?? "Notification"}
                        </p>
                        {n.template_key ? (
                          <Badge variant="muted">{n.template_key.replace(/\./g, " / ")}</Badge>
                        ) : null}
                      </div>
                      {n.body_text ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{n.body_text}</p>
                      ) : null}
                      <p className="text-muted-foreground mt-1 text-xs">
                        {timeAgo(n.created_at)} · {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!n.read_at ? (
                      <form action={markRead}>
                        <input type="hidden" name="id" value={n.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Mark read
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
