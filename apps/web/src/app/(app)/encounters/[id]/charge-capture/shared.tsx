import type { ChargeRollupStatus, ChargeStatus } from "@vitalflow/types";
import { Badge } from "@vitalflow/ui";

/**
 * ChargeStatusBadge — per-line status pill.
 */
export function ChargeStatusBadge({ status }: { status: ChargeStatus }) {
  const tone =
    status === "draft"
      ? "muted"
      : status === "posted"
        ? "info"
        : status === "billed"
          ? "success"
          : "destructive";
  return (
    <Badge variant={tone} size="sm" className="uppercase tracking-wide">
      {status}
    </Badge>
  );
}

/**
 * RollupBanner — card-level status banner driven by aggregate rollup.
 */
export function RollupBanner({
  status,
  totalMinor,
  currency,
}: {
  status: ChargeRollupStatus;
  totalMinor: number;
  currency: string;
}) {
  if (status === "empty") return null;

  const config: Record<Exclude<ChargeRollupStatus, "empty">, { tone: string; label: string }> = {
    draft: { tone: "bg-amber-50 text-amber-900 border-amber-200", label: "Review and post" },
    ready_for_claim: {
      tone: "bg-emerald-50 text-emerald-900 border-emerald-200",
      label: "Ready for claim",
    },
    on_claim: {
      tone: "bg-sky-50 text-sky-900 border-sky-200",
      label: "On submitted claim",
    },
    voided: {
      tone: "bg-slate-100 text-slate-700 border-slate-200",
      label: "All charges voided",
    },
  };

  const { tone, label } = config[status];

  return (
    <div
      className={`mb-3 flex items-center justify-between rounded-md border px-3 py-2 text-sm ${tone}`}
    >
      <span className="font-medium">{label}</span>
      <span className="font-mono tabular-nums">{formatMoney(totalMinor, currency)}</span>
    </div>
  );
}

export function formatMoney(minor: number, currency: string = "USD"): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  const code = currency === "USD" ? "$" : currency + " ";
  return `${sign}${code}${whole.toLocaleString()}.${cents}`;
}

export function shortId(s: string): string {
  return s.slice(0, 8);
}
