import { Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";
import NextLink from "next/link";
import type { ReactNode } from "react";

import { formatMoney } from "../shared.js";

// ---------------------------------------------------------------------------
// KpiCard — the primitive for the top-row KPIs
// ---------------------------------------------------------------------------

export function KpiCard({
  label,
  primary,
  secondary,
  subtext,
  tone,
  href,
}: {
  label: string;
  primary: ReactNode;
  secondary?: ReactNode;
  subtext?: ReactNode;
  tone?: "default" | "warning" | "destructive" | "success";
  href?: string;
}) {
  const toneClass =
    tone === "destructive"
      ? "border-red-200"
      : tone === "warning"
        ? "border-amber-200"
        : tone === "success"
          ? "border-emerald-200"
          : "border-slate-200";

  const body = (
    <Card className={`${toneClass} transition-shadow hover:shadow-sm`}>
      <CardHeader className="pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </CardHeader>
      <CardContent className="space-y-0.5 pb-4">
        <p className="text-2xl font-semibold tabular-nums text-slate-900">{primary}</p>
        {secondary ? <p className="text-sm text-slate-700">{secondary}</p> : null}
        {subtext ? <p className="text-[11px] text-slate-500">{subtext}</p> : null}
      </CardContent>
    </Card>
  );

  if (!href) return body;
  return (
    <NextLink href={href} className="block">
      {body}
    </NextLink>
  );
}

// ---------------------------------------------------------------------------
// MoneyKpi — helper that formats a minor-units amount
// ---------------------------------------------------------------------------

export function MoneyValue({ minor, currency }: { minor: number; currency: string }) {
  return <span>{formatMoney(minor, currency)}</span>;
}

// ---------------------------------------------------------------------------
// MiniBar — CSS-only horizontal bar. Swappable with a real chart later.
// ---------------------------------------------------------------------------

export function MiniBar({
  label,
  value,
  max,
  rightLabel,
  tone,
  href,
}: {
  label: ReactNode;
  value: number;
  max: number;
  rightLabel?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  href?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill =
    tone === "destructive"
      ? "bg-red-500"
      : tone === "warning"
        ? "bg-amber-400"
        : tone === "success"
          ? "bg-emerald-500"
          : tone === "info"
            ? "bg-sky-500"
            : "bg-slate-500";

  const content = (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-24 text-xs text-slate-700">{label}</span>
      <div className="relative h-2 flex-1 rounded bg-slate-100">
        <div
          className={`absolute left-0 top-0 h-2 rounded ${fill}`}
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <span className="w-16 text-right font-mono text-xs tabular-nums text-slate-700">
        {rightLabel ?? value.toLocaleString()}
      </span>
    </div>
  );

  if (!href) return content;
  return (
    <NextLink href={href} className="block rounded hover:bg-slate-50">
      {content}
    </NextLink>
  );
}

// ---------------------------------------------------------------------------
// PanelHeader — shared header for row-2/3 panels
// ---------------------------------------------------------------------------

export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <CardHeader className="flex-row items-center justify-between pb-3">
      <div>
        <CardTitle className="text-sm font-semibold text-slate-800">{title}</CardTitle>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="text-xs">{action}</div> : null}
    </CardHeader>
  );
}

// ---------------------------------------------------------------------------
// PanelEmpty — consistent "no data" copy inside a panel
// ---------------------------------------------------------------------------

export function PanelEmpty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm italic text-slate-500">{text}</p>;
}

// ---------------------------------------------------------------------------
// PanelError — consistent per-panel failure UI
// ---------------------------------------------------------------------------

export function PanelError({ reason }: { reason: string }) {
  return (
    <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-red-900">
      Panel unavailable — {reason.slice(0, 200)}
    </div>
  );
}
