import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import type { ClaimStatus, DenialStatus, Row, WithRelation } from "@vitalflow/types";

import type { AppSession } from "./session.js";

// ---------------------------------------------------------------------------
// Joined-row shapes — anchored to the generated Database schema
// ---------------------------------------------------------------------------
// Each of these is a narrowly-typed projection of a Supabase query that uses
// the `alias:foreign_key(columns)` nested-select syntax. Keeping the shapes
// co-located with their queries avoids `as unknown as` coercions while still
// surviving schema drift: renaming a column in a migration + regenerating
// `supabase.generated.ts` surfaces errors here at compile time.

type PatientMini = Pick<Row<"patients">, "id" | "given_name" | "family_name">;
type PayerMini = Pick<Row<"payers">, "id" | "name">;

type ClaimListRowJoined = WithRelation<
  Pick<
    Row<"claims">,
    | "id"
    | "number"
    | "status"
    | "service_start_date"
    | "service_end_date"
    | "total_minor"
    | "paid_minor"
    | "patient_resp_minor"
    | "currency"
    | "updated_at"
    | "billing_provider_id"
  >,
  "patient",
  PatientMini | null
> &
  WithRelation<Record<string, never>, "payer", PayerMini | null>;

type ClaimDetailRowJoined = WithRelation<Row<"claims">, "patient", PatientMini | null> &
  WithRelation<Record<string, never>, "payer", PayerMini | null>;

type ClaimLineRowDb = Pick<
  Row<"claim_lines">,
  | "id"
  | "line_number"
  | "cpt_code"
  | "modifiers"
  | "icd10_codes"
  | "units"
  | "charge_minor"
  | "allowed_minor"
  | "paid_minor"
  | "adjustment_minor"
  | "denial_codes"
  | "currency"
  | "service_date"
>;

type ClaimHistoryRowDb = Pick<
  Row<"claim_status_history">,
  "id" | "from_status" | "to_status" | "occurred_at" | "actor_id" | "message"
>;

type DenialQueueRowJoined = WithRelation<
  Pick<
    Row<"denials">,
    | "id"
    | "claim_id"
    | "claim_line_id"
    | "denial_codes"
    | "denied_amount_minor"
    | "currency"
    | "status"
    | "priority"
    | "assigned_to"
    | "created_at"
  >,
  "claim",
  Pick<Row<"claims">, "id" | "number"> | null
>;

type DenialDetailRowJoined = WithRelation<
  Row<"denials">,
  "claim",
  Pick<Row<"claims">, "id" | "number" | "status"> | null
> &
  WithRelation<Record<string, never>, "claim_line", Pick<Row<"claim_lines">, "cpt_code"> | null>;

type BalanceRowJoined = WithRelation<
  Row<"patient_balances">,
  "patient",
  Pick<Row<"patients">, "given_name" | "family_name"> | null
>;

/**
 * Shared server-side data fetchers for the /billing dashboard pages.
 *
 * Every function returns plain typed rows (no branded types) shaped for
 * table rendering. Tenant scoping is applied in every query; RLS also
 * enforces it at the DB layer but app-layer filtering is explicit for
 * query-planner optimization and robustness against a misconfigured RLS
 * policy.
 *
 * Not a "service" — this is Next.js-specific reading glue. Business logic
 * (state transitions, validation) lives in @vitalflow/erp-service.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ClaimRow {
  id: string;
  number: string;
  status: ClaimStatus;
  serviceStartDate: string;
  serviceEndDate: string;
  totalMinor: number;
  paidMinor: number;
  patientRespMinor: number;
  currency: string;
  updatedAt: string;
  patientName: string;
  patientId: string;
  payerName: string;
  payerId: string;
  billingProviderName: string | null;
}

export interface DenialQueueRow {
  id: string;
  claimId: string;
  claimNumber: string;
  claimLineId: string | null;
  denialCodes: readonly string[];
  deniedAmountMinor: number;
  currency: string;
  status: DenialStatus;
  priority: number;
  assignedTo: string | null;
  assignedDisplayName: string | null;
  createdAt: string;
}

export interface BalanceRow {
  id: string;
  patientId: string;
  patientName: string;
  currentBalanceMinor: number;
  aging0_30Minor: number;
  aging31_60Minor: number;
  aging61_90Minor: number;
  agingOver90Minor: number;
  currency: string;
  lastPaymentAt: string | null;
  lastStatementAt: string | null;
}

// ---------------------------------------------------------------------------
// Claims list
// ---------------------------------------------------------------------------

export interface ClaimListFilter {
  status?: readonly ClaimStatus[];
  payerId?: string;
  providerId?: string;
  serviceFrom?: string;
  serviceTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 50;

export async function getClaimList(
  session: AppSession,
  filter: ClaimListFilter,
): Promise<Paginated<ClaimRow>> {
  const supabase = await createVitalFlowServerClient();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(200, filter.pageSize ?? DEFAULT_PAGE_SIZE);

  let q = supabase
    .from("claims")
    .select(
      "id, number, status, service_start_date, service_end_date, total_minor, " +
        "paid_minor, patient_resp_minor, currency, updated_at, " +
        "billing_provider_id, " +
        "patient:patient_id(id, given_name, family_name), " +
        "payer:payer_id(id, name)",
      { count: "exact" },
    )
    .eq("tenant_id", session.tenantId)
    .order("updated_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (filter.status && filter.status.length > 0) {
    q = q.in("status", filter.status as string[]);
  }
  if (filter.payerId) q = q.eq("payer_id", filter.payerId);
  if (filter.providerId) q = q.eq("billing_provider_id", filter.providerId);
  if (filter.serviceFrom) q = q.gte("service_start_date", filter.serviceFrom);
  if (filter.serviceTo) q = q.lte("service_end_date", filter.serviceTo);
  if (filter.q && filter.q.trim().length > 0) {
    q = q.or(`number.ilike.%${filter.q.trim()}%`);
  }

  const { data, count } = await q;

  const rows: ClaimRow[] = ((data as ClaimListRowJoined[] | null) ?? []).map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status as ClaimStatus,
    serviceStartDate: r.service_start_date,
    serviceEndDate: r.service_end_date,
    totalMinor: r.total_minor,
    paidMinor: r.paid_minor ?? 0,
    patientRespMinor: r.patient_resp_minor ?? 0,
    currency: r.currency,
    updatedAt: r.updated_at,
    patientId: r.patient?.id ?? "",
    patientName: patientNameFromRow(r.patient),
    payerId: r.payer?.id ?? "",
    payerName: r.payer?.name ?? "—",
    billingProviderName: null,
  }));

  return { rows, total: count ?? rows.length, page, pageSize };
}

function patientNameFromRow(
  row: { given_name: string | null; family_name: string | null } | null,
): string {
  if (!row) return "—";
  const parts = [row.given_name, row.family_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

// ---------------------------------------------------------------------------
// Claim detail
// ---------------------------------------------------------------------------

export interface ClaimDetail {
  claim: ClaimRow & {
    coverageId: string | null;
    externalClaimId: string | null;
    submittedAt: string | null;
    adjudicatedAt: string | null;
    createdAt: string;
  };
  lines: readonly ClaimLineRow[];
  history: readonly ClaimHistoryRow[];
  denials: readonly DenialQueueRow[];
}

export interface ClaimLineRow {
  id: string;
  lineNumber: number;
  cptCode: string | null;
  modifiers: readonly string[];
  icd10Codes: readonly string[];
  units: number;
  chargeMinor: number;
  allowedMinor: number | null;
  paidMinor: number;
  adjustmentMinor: number;
  denialCodes: readonly string[];
  currency: string;
  serviceDate: string;
}

export interface ClaimHistoryRow {
  id: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  occurredAt: string;
  actorId: string | null;
  message: string | null;
}

export async function getClaimDetail(
  session: AppSession,
  claimId: string,
): Promise<ClaimDetail | null> {
  const supabase = await createVitalFlowServerClient();

  const [claimRes, linesRes, histRes, denialsRes] = await Promise.all([
    supabase
      .from("claims")
      .select(
        "id, number, status, service_start_date, service_end_date, total_minor, paid_minor, " +
          "patient_resp_minor, allowed_minor, currency, submitted_at, adjudicated_at, external_claim_id, " +
          "billing_provider_id, rendering_provider_id, coverage_id, created_at, updated_at, " +
          "patient:patient_id(id, given_name, family_name), " +
          "payer:payer_id(id, name)",
      )
      .eq("id", claimId)
      .eq("tenant_id", session.tenantId)
      .maybeSingle(),
    supabase
      .from("claim_lines")
      .select(
        "id, line_number, cpt_code, modifiers, icd10_codes, units, charge_minor, allowed_minor, " +
          "paid_minor, adjustment_minor, denial_codes, currency, service_date",
      )
      .eq("claim_id", claimId)
      .eq("tenant_id", session.tenantId)
      .order("line_number", { ascending: true }),
    supabase
      .from("claim_status_history")
      .select("id, from_status, to_status, occurred_at, actor_id, message")
      .eq("claim_id", claimId)
      .eq("tenant_id", session.tenantId)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("denials")
      .select(
        "id, claim_id, claim_line_id, denial_codes, denied_amount_minor, currency, status, " +
          "priority, assigned_to, created_at",
      )
      .eq("claim_id", claimId)
      .eq("tenant_id", session.tenantId)
      .order("priority", { ascending: true }),
  ]);

  const claimData = claimRes.data as ClaimDetailRowJoined | null;
  if (!claimData) return null;

  const claim: ClaimDetail["claim"] = {
    id: claimData.id,
    number: claimData.number,
    status: claimData.status as ClaimStatus,
    serviceStartDate: claimData.service_start_date,
    serviceEndDate: claimData.service_end_date,
    totalMinor: claimData.total_minor,
    paidMinor: claimData.paid_minor ?? 0,
    patientRespMinor: claimData.patient_resp_minor ?? 0,
    currency: claimData.currency,
    updatedAt: claimData.updated_at,
    patientId: claimData.patient?.id ?? "",
    patientName: patientNameFromRow(claimData.patient),
    payerId: claimData.payer?.id ?? "",
    payerName: claimData.payer?.name ?? "—",
    billingProviderName: null,
    coverageId: claimData.coverage_id,
    externalClaimId: claimData.external_claim_id,
    submittedAt: claimData.submitted_at,
    adjudicatedAt: claimData.adjudicated_at,
    createdAt: claimData.created_at,
  };

  const lines: ClaimLineRow[] = ((linesRes.data as ClaimLineRowDb[] | null) ?? []).map((l) => ({
    id: l.id,
    lineNumber: l.line_number,
    cptCode: l.cpt_code ?? null,
    modifiers: l.modifiers ?? [],
    icd10Codes: l.icd10_codes ?? [],
    units: l.units,
    chargeMinor: l.charge_minor,
    allowedMinor: l.allowed_minor ?? null,
    paidMinor: l.paid_minor ?? 0,
    adjustmentMinor: l.adjustment_minor ?? 0,
    denialCodes: l.denial_codes ?? [],
    currency: l.currency,
    serviceDate: l.service_date,
  }));

  const history: ClaimHistoryRow[] = ((histRes.data as ClaimHistoryRowDb[] | null) ?? []).map(
    (h) => ({
      id: h.id,
      fromStatus: (h.from_status ?? null) as ClaimStatus | null,
      toStatus: h.to_status as ClaimStatus,
      occurredAt: h.occurred_at,
      actorId: h.actor_id ?? null,
      message: h.message ?? null,
    }),
  );

  const denials: DenialQueueRow[] = ((denialsRes.data as DenialQueueRowJoined[] | null) ?? []).map(
    (d) => ({
      id: d.id,
      claimId: d.claim_id,
      claimNumber: claim.number,
      claimLineId: d.claim_line_id ?? null,
      denialCodes: d.denial_codes ?? [],
      deniedAmountMinor: d.denied_amount_minor,
      currency: d.currency,
      status: d.status as DenialStatus,
      priority: d.priority,
      assignedTo: d.assigned_to ?? null,
      assignedDisplayName: null,
      createdAt: d.created_at,
    }),
  );

  return { claim, lines, history, denials };
}

// ---------------------------------------------------------------------------
// Denial queue
// ---------------------------------------------------------------------------

export interface DenialQueueFilter {
  status?: readonly DenialStatus[];
  assignee?: "me" | "unassigned" | "any" | string;
  priority?: number;
  code?: string;
  claimId?: string;
  page?: number;
  pageSize?: number;
}

export async function getDenialQueue(
  session: AppSession,
  filter: DenialQueueFilter,
): Promise<Paginated<DenialQueueRow>> {
  const supabase = await createVitalFlowServerClient();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(200, filter.pageSize ?? DEFAULT_PAGE_SIZE);

  let q = supabase
    .from("denials")
    .select(
      "id, claim_id, claim_line_id, denial_codes, denied_amount_minor, currency, status, " +
        "priority, assigned_to, created_at, " +
        "claim:claim_id(id, number)",
      { count: "exact" },
    )
    .eq("tenant_id", session.tenantId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const statuses = filter.status ?? (["open", "working"] as const);
  q = q.in("status", statuses as string[]);

  if (filter.priority) q = q.eq("priority", filter.priority);
  if (filter.claimId) q = q.eq("claim_id", filter.claimId);
  if (filter.code) q = q.contains("denial_codes", [filter.code]);
  if (filter.assignee === "me") q = q.eq("assigned_to", session.userId);
  else if (filter.assignee === "unassigned") q = q.is("assigned_to", null);
  else if (filter.assignee && filter.assignee !== "any") {
    q = q.eq("assigned_to", filter.assignee);
  }

  const { data, count } = await q;

  const rows: DenialQueueRow[] = ((data as DenialQueueRowJoined[] | null) ?? []).map((d) => ({
    id: d.id,
    claimId: d.claim_id,
    claimNumber: d.claim?.number ?? "—",
    claimLineId: d.claim_line_id ?? null,
    denialCodes: d.denial_codes ?? [],
    deniedAmountMinor: d.denied_amount_minor,
    currency: d.currency,
    status: d.status as DenialStatus,
    priority: d.priority,
    assignedTo: d.assigned_to ?? null,
    assignedDisplayName: null,
    createdAt: d.created_at,
  }));

  return { rows, total: count ?? rows.length, page, pageSize };
}

// ---------------------------------------------------------------------------
// Denial detail
// ---------------------------------------------------------------------------

export interface DenialDetail {
  denial: DenialQueueRow & {
    reasonText: string | null;
    workNote: string | null;
    resolution: string | null;
    recoveredAmountMinor: number;
    updatedAt: string;
  };
  claimNumber: string;
  claimId: string;
  claimStatus: ClaimStatus;
  lineCpt: string | null;
  lineDescription: string | null;
}

export async function getDenialDetail(
  session: AppSession,
  denialId: string,
): Promise<DenialDetail | null> {
  const supabase = await createVitalFlowServerClient();
  const { data } = await supabase
    .from("denials")
    .select(
      "id, claim_id, claim_line_id, denial_codes, reason_text, denied_amount_minor, " +
        "recovered_amount_minor, currency, status, priority, assigned_to, assigned_at, " +
        "work_note, resolution, created_at, updated_at, " +
        "claim:claim_id(id, number, status), " +
        "claim_line:claim_line_id(cpt_code)",
    )
    .eq("id", denialId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  const r = data as DenialDetailRowJoined | null;
  if (!r) return null;

  return {
    denial: {
      id: r.id,
      claimId: r.claim_id,
      claimNumber: r.claim?.number ?? "—",
      claimLineId: r.claim_line_id ?? null,
      denialCodes: r.denial_codes ?? [],
      deniedAmountMinor: r.denied_amount_minor,
      currency: r.currency,
      status: r.status as DenialStatus,
      priority: r.priority,
      assignedTo: r.assigned_to ?? null,
      assignedDisplayName: null,
      createdAt: r.created_at,
      reasonText: r.reason_text,
      workNote: r.work_note,
      resolution: r.resolution,
      recoveredAmountMinor: r.recovered_amount_minor,
      updatedAt: r.updated_at,
    },
    claimNumber: r.claim?.number ?? "—",
    claimId: r.claim?.id ?? r.claim_id,
    claimStatus: (r.claim?.status as ClaimStatus) ?? "draft",
    lineCpt: r.claim_line?.cpt_code ?? null,
    lineDescription: null,
  };
}

// ---------------------------------------------------------------------------
// Patient balances
// ---------------------------------------------------------------------------

export interface BalanceListFilter {
  band?: "all" | "0-30" | "31-60" | "61-90" | "over-90";
  minBalanceMinor?: number;
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function getBalanceList(
  session: AppSession,
  filter: BalanceListFilter,
): Promise<Paginated<BalanceRow>> {
  const supabase = await createVitalFlowServerClient();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(200, filter.pageSize ?? DEFAULT_PAGE_SIZE);

  let q = supabase
    .from("patient_balances")
    .select(
      "id, patient_id, current_balance_minor, aging_0_30_minor, aging_31_60_minor, " +
        "aging_61_90_minor, aging_over_90_minor, currency, last_payment_at, last_statement_at, " +
        "patient:patient_id(given_name, family_name)",
      { count: "exact" },
    )
    .eq("tenant_id", session.tenantId)
    .order("aging_over_90_minor", { ascending: false })
    .order("current_balance_minor", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (filter.band === "0-30") q = q.gt("aging_0_30_minor", 0);
  else if (filter.band === "31-60") q = q.gt("aging_31_60_minor", 0);
  else if (filter.band === "61-90") q = q.gt("aging_61_90_minor", 0);
  else if (filter.band === "over-90") q = q.gt("aging_over_90_minor", 0);
  if (typeof filter.minBalanceMinor === "number") {
    q = q.gte("current_balance_minor", filter.minBalanceMinor);
  }

  const { data, count } = await q;

  const rows: BalanceRow[] = ((data as BalanceRowJoined[] | null) ?? []).map((b) => ({
    id: b.id,
    patientId: b.patient_id,
    patientName: patientNameFromRow(b.patient),
    currentBalanceMinor: b.current_balance_minor,
    aging0_30Minor: b.aging_0_30_minor,
    aging31_60Minor: b.aging_31_60_minor,
    aging61_90Minor: b.aging_61_90_minor,
    agingOver90Minor: b.aging_over_90_minor,
    currency: b.currency,
    lastPaymentAt: b.last_payment_at ?? null,
    lastStatementAt: b.last_statement_at ?? null,
  }));

  return { rows, total: count ?? rows.length, page, pageSize };
}

// ---------------------------------------------------------------------------
// Lookups for filter dropdowns
// ---------------------------------------------------------------------------

export interface PayerOption {
  id: string;
  name: string;
}

export async function listActivePayers(session: AppSession): Promise<PayerOption[]> {
  const supabase = await createVitalFlowServerClient();
  const { data } = await supabase
    .from("payers")
    .select("id, name")
    .eq("tenant_id", session.tenantId)
    .eq("active", true)
    .order("name", { ascending: true });
  return ((data as Pick<Row<"payers">, "id" | "name">[] | null) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
  }));
}
