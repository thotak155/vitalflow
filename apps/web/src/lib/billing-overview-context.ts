import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import type { ClaimStatus, PaymentMethod, Row, WithRelation } from "@vitalflow/types";

import type { AppSession } from "./session.js";

/**
 * Data fetchers for the /billing overview dashboard.
 *
 * Every fetcher returns a typed result and never throws — DB failures come
 * back as `{ ok: false, reason }` so the dashboard can render a per-panel
 * error card without crashing the whole page. Each is a single round-trip
 * (no N+1).
 *
 * Flow-based panels accept a date range + optional provider filter; state
 * panels (denials, A/R, aging, priority) ignore them by design — see
 * docs/billing-dashboard.md §11.
 */

// ---------------------------------------------------------------------------
// Filter shape
// ---------------------------------------------------------------------------

export interface OverviewFilter {
  readonly from: string; // YYYY-MM-DD
  readonly to: string; // YYYY-MM-DD
  readonly providerId?: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

function okRes<T>(value: T): Result<T> {
  return { ok: true, value };
}
function errRes<T>(reason: string): Result<T> {
  return { ok: false, reason };
}

// ---------------------------------------------------------------------------
// Filter helpers (used by the page)
// ---------------------------------------------------------------------------

export interface Preset {
  readonly id: "today" | "7d" | "30d" | "mtd";
  readonly label: string;
}
export const PRESETS: readonly Preset[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "mtd", label: "Month to date" },
];

export function resolveRange(params: { range?: string; from?: string; to?: string }): {
  from: string;
  to: string;
} {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const preset = params.range;
  if (preset === "7d") {
    const from = new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
    return { from, to: todayStr };
  }
  if (preset === "30d") {
    const from = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
    return { from, to: todayStr };
  }
  if (preset === "mtd") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { from: first, to: todayStr };
  }
  // Explicit range wins; otherwise default to today.
  if (params.from && params.to) return { from: params.from, to: params.to };
  return { from: todayStr, to: todayStr };
}

// ---------------------------------------------------------------------------
// 1. Charges posted
// ---------------------------------------------------------------------------

export interface ChargesPostedKpi {
  readonly count: number;
  readonly totalMinor: number;
  readonly currency: string;
}

export async function getChargesPosted(
  session: AppSession,
  filter: OverviewFilter,
): Promise<Result<ChargesPostedKpi>> {
  try {
    const supabase = await createVitalFlowServerClient();
    let q = supabase
      .from("charges")
      .select("total_minor, currency", { count: "exact" })
      .eq("tenant_id", session.tenantId)
      .neq("status", "voided")
      .gte("service_date", filter.from)
      .lte("service_date", filter.to);
    if (filter.providerId) q = q.eq("posted_by", filter.providerId);

    const { data, count, error } = await q;
    if (error) return errRes(error.message);

    const rows = (data as Pick<Row<"charges">, "total_minor" | "currency">[] | null) ?? [];
    const totalMinor = rows.reduce((s, r) => s + (r.total_minor ?? 0), 0);
    const currency = rows[0]?.currency ?? "USD";
    return okRes({ count: count ?? rows.length, totalMinor, currency });
  } catch (e) {
    return errRes((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// 2. Open denials
// ---------------------------------------------------------------------------

export interface OpenDenialsKpi {
  readonly count: number;
  readonly totalMinor: number;
  readonly currency: string;
  readonly urgentCount: number; // priority 1..2
  readonly agedCount: number; // > 30 days
}

export async function getOpenDenials(session: AppSession): Promise<Result<OpenDenialsKpi>> {
  try {
    const supabase = await createVitalFlowServerClient();
    const { data, error } = await supabase
      .from("denials")
      .select("denied_amount_minor, currency, priority, created_at")
      .eq("tenant_id", session.tenantId)
      .in("status", ["open", "working"]);
    if (error) return errRes(error.message);

    const rows =
      (data as
        | Pick<Row<"denials">, "denied_amount_minor" | "currency" | "priority" | "created_at">[]
        | null) ?? [];

    const totalMinor = rows.reduce((s, r) => s + (r.denied_amount_minor ?? 0), 0);
    const currency = rows[0]?.currency ?? "USD";
    const urgentCount = rows.filter((r) => r.priority <= 2).length;
    const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
    const agedCount = rows.filter((r) => new Date(r.created_at).getTime() < thirtyDaysAgo).length;
    return okRes({ count: rows.length, totalMinor, currency, urgentCount, agedCount });
  } catch (e) {
    return errRes((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// 3. Patient A/R
// ---------------------------------------------------------------------------

export interface PatientArKpi {
  readonly totalMinor: number;
  readonly patientCount: number;
  readonly currency: string;
}

export async function getPatientAr(session: AppSession): Promise<Result<PatientArKpi>> {
  try {
    const supabase = await createVitalFlowServerClient();
    const { data, error } = await supabase
      .from("patient_balances")
      .select("current_balance_minor, currency")
      .eq("tenant_id", session.tenantId)
      .gt("current_balance_minor", 0);
    if (error) return errRes(error.message);

    const rows =
      (data as Pick<Row<"patient_balances">, "current_balance_minor" | "currency">[] | null) ?? [];
    const totalMinor = rows.reduce((s, r) => s + (r.current_balance_minor ?? 0), 0);
    const currency = rows[0]?.currency ?? "USD";
    return okRes({ totalMinor, patientCount: rows.length, currency });
  } catch (e) {
    return errRes((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// 4. Claims in range  +  5. Claims by status
// ---------------------------------------------------------------------------

export interface ClaimsByStatus {
  readonly totalCount: number;
  readonly byStatus: ReadonlyArray<{ status: ClaimStatus; count: number }>;
}

const CLAIM_STATUS_ORDER: readonly ClaimStatus[] = [
  "draft",
  "ready",
  "submitted",
  "accepted",
  "paid",
  "partial",
  "denied",
  "rejected",
  "appealed",
  "closed",
];

export async function getClaimsByStatus(
  session: AppSession,
  filter: OverviewFilter,
): Promise<Result<ClaimsByStatus>> {
  try {
    const supabase = await createVitalFlowServerClient();
    let q = supabase
      .from("claims")
      .select("status")
      .eq("tenant_id", session.tenantId)
      .gte("service_start_date", filter.from)
      .lte("service_start_date", filter.to);
    if (filter.providerId) q = q.eq("billing_provider_id", filter.providerId);

    const { data, error } = await q;
    if (error) return errRes(error.message);

    const rows = (data as Pick<Row<"claims">, "status">[] | null) ?? [];
    const counts = new Map<ClaimStatus, number>();
    for (const r of rows) {
      const s = r.status as ClaimStatus;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const byStatus = CLAIM_STATUS_ORDER.filter((s) => counts.has(s)).map((s) => ({
      status: s,
      count: counts.get(s) ?? 0,
    }));
    return okRes({ totalCount: rows.length, byStatus });
  } catch (e) {
    return errRes((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// 6. Aging snapshot
// ---------------------------------------------------------------------------

export interface AgingSnapshot {
  readonly b0_30Minor: number;
  readonly b31_60Minor: number;
  readonly b61_90Minor: number;
  readonly bOver90Minor: number;
  readonly currency: string;
  readonly asOf: string;
}

export async function getAgingSnapshot(session: AppSession): Promise<Result<AgingSnapshot>> {
  try {
    const supabase = await createVitalFlowServerClient();
    const { data, error } = await supabase
      .from("patient_balances")
      .select(
        "aging_0_30_minor, aging_31_60_minor, aging_61_90_minor, aging_over_90_minor, currency",
      )
      .eq("tenant_id", session.tenantId);
    if (error) return errRes(error.message);

    type AgingPick = Pick<
      Row<"patient_balances">,
      | "aging_0_30_minor"
      | "aging_31_60_minor"
      | "aging_61_90_minor"
      | "aging_over_90_minor"
      | "currency"
    >;
    const rows = (data as AgingPick[] | null) ?? [];

    const sum = (k: keyof AgingPick) => rows.reduce((s, r) => s + ((r[k] as number) ?? 0), 0);
    return okRes({
      b0_30Minor: sum("aging_0_30_minor"),
      b31_60Minor: sum("aging_31_60_minor"),
      b61_90Minor: sum("aging_61_90_minor"),
      bOver90Minor: sum("aging_over_90_minor"),
      currency: rows[0]?.currency ?? "USD",
      asOf: new Date().toISOString(),
    });
  } catch (e) {
    return errRes((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// 7. Recent payments
// ---------------------------------------------------------------------------

export interface RecentPaymentRow {
  readonly id: string;
  readonly method: PaymentMethod;
  readonly amountMinor: number;
  readonly currency: string;
  readonly receivedAt: string;
  readonly patientName: string | null;
  readonly payerName: string | null;
}

export async function getRecentPayments(
  session: AppSession,
  filter: OverviewFilter,
  limit: number = 8,
): Promise<Result<readonly RecentPaymentRow[]>> {
  try {
    const supabase = await createVitalFlowServerClient();
    const { data, error } = await supabase
      .from("payments")
      .select(
        "id, method, amount_minor, currency, received_at, " +
          "patient:patient_id(given_name, family_name), " +
          "payer:payer_id(name)",
      )
      .eq("tenant_id", session.tenantId)
      .gte("received_at", `${filter.from}T00:00:00Z`)
      .lte("received_at", `${filter.to}T23:59:59Z`)
      .order("received_at", { ascending: false })
      .limit(limit);
    if (error) return errRes(error.message);

    type PaymentListRow = WithRelation<
      Pick<Row<"payments">, "id" | "method" | "amount_minor" | "currency" | "received_at">,
      "patient",
      Pick<Row<"patients">, "given_name" | "family_name"> | null
    > &
      WithRelation<Record<string, never>, "payer", Pick<Row<"payers">, "name"> | null>;
    const rows = (data as PaymentListRow[] | null) ?? [];
    return okRes(
      rows.map((r) => {
        const pnParts = [r.patient?.given_name, r.patient?.family_name].filter(Boolean);
        return {
          id: r.id,
          method: r.method as PaymentMethod,
          amountMinor: r.amount_minor,
          currency: r.currency,
          receivedAt: r.received_at,
          patientName: pnParts.length > 0 ? pnParts.join(" ") : null,
          payerName: r.payer?.name ?? null,
        };
      }),
    );
  } catch (e) {
    return errRes((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// 8. Denial priority breakdown
// ---------------------------------------------------------------------------

export interface DenialPriorityBreakdown {
  readonly byPriority: ReadonlyArray<{ priority: number; count: number }>;
  readonly totalOpen: number;
}

export async function getDenialPriorityBreakdown(
  session: AppSession,
): Promise<Result<DenialPriorityBreakdown>> {
  try {
    const supabase = await createVitalFlowServerClient();
    const { data, error } = await supabase
      .from("denials")
      .select("priority")
      .eq("tenant_id", session.tenantId)
      .in("status", ["open", "working"]);
    if (error) return errRes(error.message);

    const rows = (data as Pick<Row<"denials">, "priority">[] | null) ?? [];
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.priority, (counts.get(r.priority) ?? 0) + 1);
    const byPriority = [1, 2, 3, 4, 5]
      .filter((p) => counts.has(p))
      .map((p) => ({ priority: p, count: counts.get(p) ?? 0 }));
    return okRes({ byPriority, totalOpen: rows.length });
  } catch (e) {
    return errRes((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Provider options (for filter dropdown)
// ---------------------------------------------------------------------------

export interface ProviderOption {
  readonly id: string;
  readonly displayName: string;
}

export async function listProvidersInClaims(
  session: AppSession,
): Promise<readonly ProviderOption[]> {
  try {
    const supabase = await createVitalFlowServerClient();
    const { data } = await supabase
      .from("claims")
      .select("billing_provider_id")
      .eq("tenant_id", session.tenantId)
      .not("billing_provider_id", "is", null);
    const ids = new Set<string>();
    for (const r of (data as Pick<Row<"claims">, "billing_provider_id">[] | null) ?? []) {
      if (r.billing_provider_id) ids.add(r.billing_provider_id);
    }
    // For V1 show the raw UUID prefix; a later slice joins to auth.users to
    // get display names (requires a tenant_members view with user display).
    return Array.from(ids).map((id) => ({ id, displayName: id.slice(0, 8) }));
  } catch {
    return [];
  }
}
