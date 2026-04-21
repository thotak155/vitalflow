import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vitalflow/ui";
import { ClipboardList } from "@vitalflow/ui/icons";
import { AppBreadcrumbs } from "@vitalflow/ui/layout";
import { EmptyState, PageHeader } from "@vitalflow/ui/patterns";
import NextLink from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "../../../lib/session.js";

export const dynamic = "force-dynamic";

interface TasksSearchParams {
  scope?: "mine" | "unassigned" | "all";
  status?: string;
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  assigned_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  tags: string[];
  subject_table: string | null;
  subject_id: string | null;
  created_at: string;
};

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

function relDue(iso: string | null): { label: string; overdue: boolean } {
  if (!iso) return { label: "—", overdue: false };
  const due = new Date(iso).getTime();
  const now = Date.now();
  const diff = due - now;
  const absHr = Math.abs(Math.floor(diff / 3_600_000));
  if (diff < 0) {
    return {
      label: absHr < 24 ? `${absHr}h overdue` : `${Math.floor(absHr / 24)}d overdue`,
      overdue: true,
    };
  }
  if (absHr < 24) return { label: `in ${absHr}h`, overdue: false };
  return { label: `in ${Math.floor(absHr / 24)}d`, overdue: false };
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<TasksSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/tasks");

  const params = await searchParams;
  const scope = params.scope === "unassigned" || params.scope === "all" ? params.scope : "mine";
  const status = params.status ?? "";

  const supabase = await createVitalFlowServerClient();
  let q = supabase
    .from("tasks")
    .select(
      "id, title, description, status, priority, assignee_id, assigned_at, due_at, completed_at, tags, subject_table, subject_id, created_at",
    )
    .eq("tenant_id", session.tenantId)
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("priority", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200);

  if (scope === "mine") {
    q = q.eq("assignee_id", session.userId);
  } else if (scope === "unassigned") {
    q = q.is("assignee_id", null);
  }
  if (status) {
    q = q.eq("status", status);
  } else {
    // Default: hide completed/cancelled unless explicitly asked
    q = q.in("status", ["pending", "assigned", "in_progress", "blocked"]);
  }

  const { data: rowsRaw, error } = await q;
  const rows = (rowsRaw ?? []) as unknown as TaskRow[];

  // Count groups for the pill tabs.
  const [mineCount, unassignedCount] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenantId)
      .eq("assignee_id", session.userId)
      .in("status", ["pending", "assigned", "in_progress", "blocked"]),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenantId)
      .is("assignee_id", null)
      .in("status", ["pending", "assigned", "in_progress", "blocked"]),
  ]);

  return (
    <>
      <AppBreadcrumbs
        LinkComponent={NextLink}
        items={[{ label: "Home", href: "/" }, { label: "Tasks" }]}
      />
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        description="Open work items assigned to you or waiting to be picked up."
      />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <NextLink
          href="/tasks?scope=mine"
          className={`rounded-full px-3 py-1 ${
            scope === "mine" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-700"
          }`}
        >
          My tasks {mineCount.count ? `(${mineCount.count})` : ""}
        </NextLink>
        <NextLink
          href="/tasks?scope=unassigned"
          className={`rounded-full px-3 py-1 ${
            scope === "unassigned"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 text-slate-700"
          }`}
        >
          Unassigned {unassignedCount.count ? `(${unassignedCount.count})` : ""}
        </NextLink>
        <NextLink
          href="/tasks?scope=all"
          className={`rounded-full px-3 py-1 ${
            scope === "all" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-700"
          }`}
        >
          All open
        </NextLink>
        <span className="mx-2 text-slate-300">|</span>
        <NextLink
          href={`/tasks?scope=${scope}&status=completed`}
          className={`rounded-full px-3 py-1 ${
            status === "completed"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 text-slate-700"
          }`}
        >
          Completed
        </NextLink>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {scope === "mine"
              ? "My tasks"
              : scope === "unassigned"
                ? "Unassigned"
                : "All open tasks"}{" "}
            ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Failed to load: {error.message}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={scope === "mine" ? "No tasks assigned to you" : "Nothing open"}
              description={
                scope === "mine"
                  ? "When workflows route something to you, it'll land here."
                  : scope === "unassigned"
                    ? "All tasks have an assignee."
                    : "Nothing open across the practice."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const due = relDue(t.due_at);
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <NextLink
                          href={`/tasks/${t.id}`}
                          className="font-medium text-sky-700 hover:underline"
                        >
                          {t.title}
                        </NextLink>
                        {t.tags.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {t.tags.map((tag) => (
                              <Badge key={tag} variant="muted">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={PRIORITY_VARIANTS[t.priority] ?? "default"}>
                          {t.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[t.status] ?? "default"}>
                          {t.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={due.overdue ? "text-destructive text-sm font-medium" : "text-sm"}
                      >
                        {due.label}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {t.subject_table && t.subject_id ? (
                          <NextLink
                            href={subjectHref(t.subject_table, t.subject_id)}
                            className="hover:underline"
                          >
                            {t.subject_table.replace(/_/g, " ")} →
                          </NextLink>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function subjectHref(table: string, id: string): string {
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
      return "#";
  }
}
