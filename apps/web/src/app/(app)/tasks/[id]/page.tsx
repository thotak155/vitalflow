import { createVitalFlowServerClient, type SupabaseServerClient } from "@vitalflow/auth/server";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Textarea,
} from "@vitalflow/ui";
import { AlertCircle, CheckCircle2 } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { getSession } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  assigned_at: string | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  tags: string[];
  subject_table: string | null;
  subject_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type CommentRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type ProfileMini = { full_name: string | null; email: string };

const PRIORITY_VARIANTS: Record<string, "muted" | "default" | "warning" | "destructive"> = {
  low: "muted",
  normal: "default",
  high: "warning",
  urgent: "destructive",
};
const STATUS_VARIANTS: Record<string, "muted" | "default" | "warning" | "success" | "destructive"> =
  {
    pending: "muted",
    assigned: "default",
    in_progress: "warning",
    blocked: "destructive",
    completed: "success",
    cancelled: "muted",
  };

type WritableTasks = {
  update: (v: Record<string, unknown>) => {
    eq: (
      c: string,
      v: string,
    ) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};
type WritableComments = {
  insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};

function tasksTable(c: SupabaseServerClient): WritableTasks {
  return (c as unknown as { from: (t: string) => WritableTasks }).from("tasks");
}
function commentsTable(c: SupabaseServerClient): WritableComments {
  return (c as unknown as { from: (t: string) => WritableComments }).from("task_comments");
}

async function updateStatus(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("status") ?? "");
  if (!id || !next) return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: next };
  if (next === "in_progress") patch.started_at = now;
  if (next === "completed") patch.completed_at = now;
  if (next === "cancelled") patch.cancelled_at = now;

  const supabase = await createVitalFlowServerClient();
  await tasksTable(supabase).update(patch).eq("id", id).eq("tenant_id", session.tenantId);
  revalidatePath(`/tasks/${id}`);
  redirect(`/tasks/${id}?ok=${encodeURIComponent(`Status set to ${next.replace(/_/g, " ")}`)}`);
}

async function claimTask(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createVitalFlowServerClient();
  await tasksTable(supabase)
    .update({
      assignee_id: session.userId,
      assigned_at: new Date().toISOString(),
      status: "assigned",
    })
    .eq("id", id)
    .eq("tenant_id", session.tenantId);
  revalidatePath(`/tasks/${id}`);
  redirect(`/tasks/${id}?ok=${encodeURIComponent("Claimed")}`);
}

async function addComment(formData: FormData): Promise<void> {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const taskId = String(formData.get("task_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!taskId || !body) return;

  const supabase = await createVitalFlowServerClient();
  const { error } = await commentsTable(supabase).insert({
    tenant_id: session.tenantId,
    task_id: taskId,
    author_id: session.userId,
    body,
  });
  if (error) {
    redirect(`/tasks/${taskId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}?ok=${encodeURIComponent("Comment added")}`);
}

function subjectHref(table: string | null, id: string | null): string | null {
  if (!table || !id) return null;
  switch (table) {
    case "encounters":
      return `/encounters/${id}`;
    case "patients":
      return `/patients/${id}`;
    case "claims":
      return `/billing/claims/${id}`;
    case "denials":
      return `/billing/denials/${id}`;
    case "appointments":
      return `/appointments/${id}`;
    default:
      return null;
  }
}

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createVitalFlowServerClient();
  const { data: taskRaw } = await supabase
    .from("tasks")
    .select(
      "id, title, description, status, priority, assignee_id, assigned_at, due_at, started_at, completed_at, cancelled_at, tags, subject_table, subject_id, created_by, created_at, updated_at",
    )
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  const task = taskRaw as TaskRow | null;
  if (!task) notFound();

  const { data: commentsRaw } = await supabase
    .from("task_comments")
    .select("id, author_id, body, created_at")
    .eq("task_id", id)
    .eq("tenant_id", session.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const comments = (commentsRaw ?? []) as unknown as CommentRow[];

  const refIds = Array.from(
    new Set(
      [task.assignee_id, task.created_by, ...comments.map((c) => c.author_id)].filter(
        Boolean,
      ) as string[],
    ),
  );
  const profileMap = new Map<string, ProfileMini>();
  if (refIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", refIds);
    for (const p of (profs ?? []) as { id: string; full_name: string | null; email: string }[]) {
      profileMap.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }
  const displayFor = (uid: string | null): string => {
    if (!uid) return "—";
    const p = profileMap.get(uid);
    return p?.full_name ?? p?.email ?? uid.slice(0, 8);
  };

  const ref = subjectHref(task.subject_table, task.subject_id);
  const isMine = task.assignee_id === session.userId;
  const isOpen =
    task.status === "pending" || task.status === "assigned" || task.status === "in_progress";

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[
          { label: "Home", href: "/" },
          { label: "Tasks", href: "/tasks" },
          { label: task.title },
        ]}
      />
      <PageHeader
        eyebrow="Task"
        title={task.title}
        description={
          <span className="flex items-center gap-2 text-sm">
            <Badge variant={PRIORITY_VARIANTS[task.priority] ?? "default"}>{task.priority}</Badge>
            <Badge variant={STATUS_VARIANTS[task.status] ?? "default"}>
              {task.status.replace(/_/g, " ")}
            </Badge>
            <span className="text-muted-foreground">
              Opened {new Date(task.created_at).toLocaleString()} by {displayFor(task.created_by)}
            </span>
          </span>
        }
      />

      {sp.ok ? (
        <div
          role="status"
          className="border-success/30 bg-success/5 mb-4 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{sp.ok}</span>
        </div>
      ) : null}
      {sp.error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 mb-4 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{sp.error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1fr,320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {task.description ? (
                <p className="whitespace-pre-wrap text-slate-800">{task.description}</p>
              ) : (
                <p className="text-muted-foreground italic">No description.</p>
              )}
              {task.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {task.tags.map((t) => (
                    <Badge key={t} variant="muted">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {ref ? (
                <p className="text-sm">
                  Related:{" "}
                  <NextLink href={ref} className="text-sky-700 hover:underline">
                    {task.subject_table?.replace(/_/g, " ")} →
                  </NextLink>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity ({comments.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {comments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No comments yet.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {comments.map((c) => (
                    <li key={c.id} className="border-b border-slate-100 pb-3 last:border-b-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{displayFor(c.author_id)}</span>
                        <span className="text-muted-foreground text-xs">
                          {new Date(c.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-slate-800">{c.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              <form action={addComment} className="mt-4 space-y-2">
                <input type="hidden" name="task_id" value={task.id} />
                <FormField label="Add comment" htmlFor="comment-body">
                  <Textarea
                    id="comment-body"
                    name="body"
                    rows={3}
                    required
                    placeholder="Leave a note on this task…"
                  />
                </FormField>
                <Button type="submit" variant="outline" size="sm">
                  Post comment
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <DetailRow label="Assignee" value={displayFor(task.assignee_id)} />
              <DetailRow
                label="Due"
                value={task.due_at ? new Date(task.due_at).toLocaleString() : "—"}
              />
              <DetailRow
                label="Started"
                value={task.started_at ? new Date(task.started_at).toLocaleString() : "—"}
              />
              <DetailRow
                label="Completed"
                value={task.completed_at ? new Date(task.completed_at).toLocaleString() : "—"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!task.assignee_id ? (
                <form action={claimTask}>
                  <input type="hidden" name="id" value={task.id} />
                  <Button type="submit" variant="default" size="sm" className="w-full">
                    Claim task
                  </Button>
                </form>
              ) : null}

              {isMine && isOpen && task.status !== "in_progress" ? (
                <form action={updateStatus}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="status" value="in_progress" />
                  <Button type="submit" variant="default" size="sm" className="w-full">
                    Start
                  </Button>
                </form>
              ) : null}

              {isMine && isOpen ? (
                <>
                  <form action={updateStatus}>
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="status" value="completed" />
                    <Button type="submit" variant="default" size="sm" className="w-full">
                      Mark complete
                    </Button>
                  </form>
                  <form action={updateStatus}>
                    <input type="hidden" name="id" value={task.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={task.status === "blocked" ? "assigned" : "blocked"}
                    />
                    <Button type="submit" variant="outline" size="sm" className="w-full">
                      {task.status === "blocked" ? "Unblock" : "Block"}
                    </Button>
                  </form>
                </>
              ) : null}

              {!isOpen && task.status !== "cancelled" ? (
                <p className="text-muted-foreground text-xs italic">This task is closed.</p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}
