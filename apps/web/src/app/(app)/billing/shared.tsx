import type { ClaimStatus, DenialStatus } from "@vitalflow/types";
import { Badge } from "@vitalflow/ui";
import NextLink from "next/link";

// ---------------------------------------------------------------------------
// StatusBadge — semantic mapping for both claim and denial states
// ---------------------------------------------------------------------------

const CLAIM_TONE: Record<ClaimStatus, "muted" | "info" | "warning" | "success" | "destructive"> = {
  draft: "muted",
  ready: "info",
  submitted: "warning",
  accepted: "info",
  rejected: "destructive",
  paid: "success",
  partial: "warning",
  denied: "destructive",
  appealed: "warning",
  closed: "muted",
};

const DENIAL_TONE: Record<DenialStatus, "muted" | "info" | "warning" | "success" | "destructive"> =
  {
    open: "destructive",
    working: "warning",
    appealed: "warning",
    resolved: "success",
    written_off: "muted",
    uncollectable: "muted",
  };

const DENIAL_LABEL: Record<DenialStatus, string> = {
  open: "Open",
  working: "Working",
  appealed: "Appealed",
  resolved: "Resolved",
  written_off: "Written off",
  uncollectable: "Uncollectable",
};

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <Badge variant={CLAIM_TONE[status]} size="sm" className="uppercase tracking-wide">
      {status}
    </Badge>
  );
}

export function DenialStatusBadge({ status }: { status: DenialStatus }) {
  return (
    <Badge variant={DENIAL_TONE[status]} size="sm">
      {DENIAL_LABEL[status]}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Money + time + small utilities
// ---------------------------------------------------------------------------

export function formatMoney(minor: number, currency: string = "USD"): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  const code = currency === "USD" ? "$" : currency + " ";
  return `${sign}${code}${whole.toLocaleString()}.${cents}`;
}

export function MoneyCell({
  minor,
  currency,
  danger,
  bold,
}: {
  minor: number;
  currency: string;
  danger?: boolean;
  bold?: boolean;
}) {
  const classes = [
    "tabular-nums font-mono",
    danger && minor !== 0 ? "text-red-700" : "",
    bold && minor !== 0 ? "font-semibold" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={classes}>{formatMoney(minor, currency)}</span>;
}

/** Days between `from` (ISO string) and now. */
export function daysAgo(iso: string, now: Date = new Date()): number {
  const t0 = new Date(iso).getTime();
  const ms = now.getTime() - t0;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/** Relative time string — "3d ago", "2h ago", "just now". */
export function RelativeTime({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-slate-400">—</span>;
  const t0 = new Date(iso).getTime();
  const ms = Date.now() - t0;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return <span>just now</span>;
  if (mins < 60) return <span>{mins}m ago</span>;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return <span>{hours}h ago</span>;
  const days = Math.floor(hours / 24);
  if (days < 30) return <span>{days}d ago</span>;
  const months = Math.floor(days / 30);
  if (months < 12) return <span>{months}mo ago</span>;
  const years = Math.floor(days / 365);
  return <span>{years}y ago</span>;
}

// ---------------------------------------------------------------------------
// Priority dot — ★1 urgent, ★5 low
// ---------------------------------------------------------------------------

export function PriorityDot({ priority }: { priority: number }) {
  const color =
    priority <= 2
      ? "bg-red-500"
      : priority === 3
        ? "bg-amber-500"
        : priority === 4
          ? "bg-slate-400"
          : "bg-slate-300";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden />
      <span>★{priority}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pagination — pure server-rendered prev/next links
// ---------------------------------------------------------------------------

export function Pagination({
  basePath,
  searchParams,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const makeHref = (targetPage: number): string => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined || k === "page") continue;
      if (Array.isArray(v)) v.forEach((vv) => params.append(k, vv));
      else params.set(k, v);
    }
    params.set("page", String(targetPage));
    return `${basePath}?${params.toString()}`;
  };

  return (
    <nav className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-sm">
      <span className="text-slate-600">
        Page {page} of {totalPages} · {total.toLocaleString()} total
      </span>
      <span className="flex items-center gap-2">
        {page > 1 ? (
          <NextLink
            className="rounded border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
            href={makeHref(page - 1)}
          >
            Previous
          </NextLink>
        ) : (
          <span className="rounded border border-slate-100 px-2 py-1 text-slate-400">Previous</span>
        )}
        {page < totalPages ? (
          <NextLink
            className="rounded border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
            href={makeHref(page + 1)}
          >
            Next
          </NextLink>
        ) : (
          <span className="rounded border border-slate-100 px-2 py-1 text-slate-400">Next</span>
        )}
      </span>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Flash banner for ?ok / ?error
// ---------------------------------------------------------------------------

export function FlashBanner({
  ok,
  error,
}: {
  ok?: string | undefined;
  error?: string | undefined;
}) {
  if (!ok && !error) return null;
  const tone = error
    ? "border-red-200 bg-red-50 text-red-900"
    : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${tone}`}>{error ?? ok}</div>;
}

// ---------------------------------------------------------------------------
// Querystring helper for filter forms
// ---------------------------------------------------------------------------

export function toArray(v: string | string[] | undefined): readonly string[] {
  if (!v) return [];
  return Array.isArray(v)
    ? v
    : v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

export function firstOrEmpty(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

export function firstOrUndef(v: string | string[] | undefined): string | undefined {
  const s = firstOrEmpty(v);
  return s.length > 0 ? s : undefined;
}
