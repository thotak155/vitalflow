import type { SupabaseAdminClient } from "@vitalflow/auth/admin";
import type {
  AICodeSource,
  AICodeType,
  AgingBand,
  ChargeId,
  ChargeLine,
  ChargeStatus,
  ClaimStatus,
  Confidence,
  Denial,
  DenialStatus,
  EncounterId,
  Insert,
  PatientBalance,
  PatientId,
  Payment,
  PaymentMethod,
  Row,
  TenantId,
  Update,
  UserId,
} from "@vitalflow/types";

/**
 * Supabase-backed data-access adapters for every ERP service in this
 * package. Each `make...` factory takes a typed admin client and returns
 * the interface shape its service needs.
 *
 * Co-locating these keeps SQL details out of the service files (which stay
 * pure business logic + permission checks + audit emission) and means tests
 * can swap in-memory adapters without touching Supabase.
 */

// ===========================================================================
// Shared row mappers
// ===========================================================================

export function chargeRowToChargeLine(row: Row<"charges">): ChargeLine {
  return {
    id: row.id as ChargeId,
    tenantId: row.tenant_id as TenantId,
    patientId: row.patient_id as PatientId,
    encounterId: (row.encounter_id ?? null) as EncounterId | null,
    orderId: row.order_id ?? null,
    cptCode: row.cpt_code ?? null,
    hcpcsCode: row.hcpcs_code ?? null,
    revenueCode: row.revenue_code ?? null,
    icd10Codes: row.icd10_codes ?? [],
    modifiers: row.modifiers ?? [],
    units: row.units,
    unitPriceMinor: row.unit_price_minor,
    totalMinor: row.total_minor,
    currency: row.currency,
    serviceDate: row.service_date,
    postedAt: row.posted_at ?? null,
    postedBy: (row.posted_by ?? null) as UserId | null,
    status: row.status as ChargeStatus,
    notes: row.notes ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function balanceRowToDomain(row: Row<"patient_balances">): PatientBalance {
  return {
    id: row.id as PatientBalance["id"],
    tenantId: row.tenant_id as TenantId,
    patientId: row.patient_id as PatientId,
    currentBalanceMinor: row.current_balance_minor,
    aging0_30Minor: row.aging_0_30_minor,
    aging31_60Minor: row.aging_31_60_minor,
    aging61_90Minor: row.aging_61_90_minor,
    agingOver90Minor: row.aging_over_90_minor,
    currency: row.currency,
    lastStatementAt: row.last_statement_at ?? null,
    lastPaymentAt: row.last_payment_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function paymentRowToDomain(row: Row<"payments">): Payment {
  return {
    id: row.id as Payment["id"],
    tenantId: row.tenant_id as TenantId,
    invoiceId: (row.invoice_id ?? null) as Payment["invoiceId"],
    patientId: (row.patient_id ?? null) as Payment["patientId"],
    payerId: (row.payer_id ?? null) as Payment["payerId"],
    method: row.method as PaymentMethod,
    amountMinor: row.amount_minor,
    currency: row.currency,
    receivedAt: row.received_at,
    reference: row.reference ?? null,
    processor: row.processor ?? null,
    processorRef: row.processor_ref ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}

export function denialRowToDomain(row: Row<"denials">): Denial {
  return {
    id: row.id as Denial["id"],
    tenantId: row.tenant_id as TenantId,
    claimId: row.claim_id as Denial["claimId"],
    claimLineId: (row.claim_line_id ?? null) as Denial["claimLineId"],
    denialCodes: row.denial_codes ?? [],
    reasonText: row.reason_text ?? null,
    status: row.status as DenialStatus,
    priority: row.priority,
    assignedTo: (row.assigned_to ?? null) as UserId | null,
    assignedAt: row.assigned_at ?? null,
    workNote: row.work_note ?? null,
    resolution: row.resolution ?? null,
    deniedAmountMinor: row.denied_amount_minor,
    recoveredAmountMinor: row.recovered_amount_minor,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ===========================================================================
// PatientBalance data access
// ===========================================================================

export interface PatientBalanceDataAccess {
  getByTenantAndPatient(tenantId: string, patientId: PatientId): Promise<PatientBalance | null>;

  /** Insert or update the single row per (tenant, patient). */
  upsert(row: Insert<"patient_balances">): Promise<PatientBalance>;

  list(
    tenantId: string,
    filter: {
      band?: AgingBand;
      minBalanceMinor?: number;
      maxBalanceMinor?: number;
      sort?: "over90_desc" | "current_desc" | "updated_desc";
      limit: number;
      offset: number;
    },
  ): Promise<readonly PatientBalance[]>;

  /** Sum of non-voided charges.total_minor for patient. */
  sumChargesForPatient(tenantId: string, patientId: PatientId): Promise<number>;

  /** Sum of payments.amount_minor where patient_id = patientId. */
  sumPaymentsForPatient(tenantId: string, patientId: PatientId): Promise<number>;
}

export function makeSupabasePatientBalanceData(
  admin: SupabaseAdminClient,
): PatientBalanceDataAccess {
  return {
    async getByTenantAndPatient(tenantId, patientId) {
      const { data, error } = await admin
        .from("patient_balances")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("patient_id", patientId as string)
        .maybeSingle();
      if (error) throw new Error(`getByTenantAndPatient: ${error.message}`);
      return data ? balanceRowToDomain(data) : null;
    },

    async upsert(row) {
      const { data, error } = await admin
        .from("patient_balances")
        .upsert(row, { onConflict: "tenant_id,patient_id" })
        .select("*")
        .single();
      if (error) throw new Error(`upsert: ${error.message}`);
      return balanceRowToDomain(data);
    },

    async list(tenantId, filter) {
      let q = admin
        .from("patient_balances")
        .select("*")
        .eq("tenant_id", tenantId)
        .range(filter.offset, filter.offset + filter.limit - 1);

      if (filter.band === "0-30") q = q.gt("aging_0_30_minor", 0);
      else if (filter.band === "31-60") q = q.gt("aging_31_60_minor", 0);
      else if (filter.band === "61-90") q = q.gt("aging_61_90_minor", 0);
      else if (filter.band === "over-90") q = q.gt("aging_over_90_minor", 0);

      if (typeof filter.minBalanceMinor === "number") {
        q = q.gte("current_balance_minor", filter.minBalanceMinor);
      }
      if (typeof filter.maxBalanceMinor === "number") {
        q = q.lte("current_balance_minor", filter.maxBalanceMinor);
      }

      const sort = filter.sort ?? "over90_desc";
      if (sort === "over90_desc") {
        q = q
          .order("aging_over_90_minor", { ascending: false })
          .order("current_balance_minor", { ascending: false });
      } else if (sort === "current_desc") {
        q = q.order("current_balance_minor", { ascending: false });
      } else {
        q = q.order("updated_at", { ascending: false });
      }

      const { data, error } = await q;
      if (error) throw new Error(`list: ${error.message}`);
      return (data ?? []).map(balanceRowToDomain);
    },

    async sumChargesForPatient(tenantId, patientId) {
      const { data, error } = await admin
        .from("charges")
        .select("total_minor, status")
        .eq("tenant_id", tenantId)
        .eq("patient_id", patientId as string);
      if (error) throw new Error(`sumChargesForPatient: ${error.message}`);
      const rows = (data ?? []) as Pick<Row<"charges">, "total_minor" | "status">[];
      return rows
        .filter((r) => r.status !== "voided")
        .reduce((s, r) => s + (r.total_minor ?? 0), 0);
    },

    async sumPaymentsForPatient(tenantId, patientId) {
      const { data, error } = await admin
        .from("payments")
        .select("amount_minor")
        .eq("tenant_id", tenantId)
        .eq("patient_id", patientId as string);
      if (error) throw new Error(`sumPaymentsForPatient: ${error.message}`);
      const rows = (data ?? []) as Pick<Row<"payments">, "amount_minor">[];
      return rows.reduce((s, r) => s + (r.amount_minor ?? 0), 0);
    },
  };
}

// ===========================================================================
// Payment data access
// ===========================================================================

export interface PaymentDataAccess {
  insert(row: Insert<"payments">): Promise<Payment>;
  getById(tenantId: string, id: Payment["id"]): Promise<Payment | null>;
  list(
    tenantId: string,
    filter: {
      patientId?: PatientId;
      invoiceId?: Payment["invoiceId"];
      payerId?: Payment["payerId"];
      method?: PaymentMethod;
      receivedAfter?: string;
      receivedBefore?: string;
      limit: number;
      offset: number;
    },
  ): Promise<readonly Payment[]>;
  /** Sum of all prior non-refund payments pointing at this payment's reverse. Used to cap refunds. */
  totalPaidForInvoice(tenantId: string, invoiceId: string): Promise<number>;
}

export function makeSupabasePaymentData(admin: SupabaseAdminClient): PaymentDataAccess {
  return {
    async insert(row) {
      const { data, error } = await admin.from("payments").insert(row).select("*").single();
      if (error) throw new Error(`payments.insert: ${error.message}`);
      return paymentRowToDomain(data);
    },
    async getById(tenantId, id) {
      const { data, error } = await admin
        .from("payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", id as string)
        .maybeSingle();
      if (error) throw new Error(`payments.getById: ${error.message}`);
      return data ? paymentRowToDomain(data) : null;
    },
    async list(tenantId, filter) {
      let q = admin
        .from("payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("received_at", { ascending: false })
        .range(filter.offset, filter.offset + filter.limit - 1);

      if (filter.patientId) q = q.eq("patient_id", filter.patientId as string);
      if (filter.invoiceId) q = q.eq("invoice_id", filter.invoiceId as string);
      if (filter.payerId) q = q.eq("payer_id", filter.payerId as string);
      if (filter.method) q = q.eq("method", filter.method);
      if (filter.receivedAfter) q = q.gte("received_at", filter.receivedAfter);
      if (filter.receivedBefore) q = q.lte("received_at", filter.receivedBefore);

      const { data, error } = await q;
      if (error) throw new Error(`payments.list: ${error.message}`);
      return (data ?? []).map(paymentRowToDomain);
    },
    async totalPaidForInvoice(tenantId, invoiceId) {
      const { data, error } = await admin
        .from("payments")
        .select("amount_minor")
        .eq("tenant_id", tenantId)
        .eq("invoice_id", invoiceId);
      if (error) throw new Error(`totalPaidForInvoice: ${error.message}`);
      const rows = (data ?? []) as Pick<Row<"payments">, "amount_minor">[];
      return rows.reduce((s, r) => s + (r.amount_minor ?? 0), 0);
    },
  };
}

// ===========================================================================
// Denial data access
// ===========================================================================

export interface DenialDataAccess {
  getById(tenantId: string, id: Denial["id"]): Promise<Denial | null>;
  insert(row: Insert<"denials">): Promise<Denial>;
  update(tenantId: string, id: Denial["id"], patch: Update<"denials">): Promise<Denial>;
  list(
    tenantId: string,
    filter: {
      status?: readonly DenialStatus[];
      assignedTo?: UserId | null;
      onlyUnassigned?: boolean;
      priority?: number;
      claimId?: Denial["claimId"];
      limit: number;
      offset: number;
    },
  ): Promise<readonly Denial[]>;
  /** Returns the parent claim's current status — used for auto-close reconciliation. */
  getParentClaimStatus(tenantId: string, claimId: string): Promise<ClaimStatus | null>;
}

export function makeSupabaseDenialData(admin: SupabaseAdminClient): DenialDataAccess {
  return {
    async getById(tenantId, id) {
      const { data, error } = await admin
        .from("denials")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", id as string)
        .maybeSingle();
      if (error) throw new Error(`denials.getById: ${error.message}`);
      return data ? denialRowToDomain(data) : null;
    },
    async insert(row) {
      const { data, error } = await admin.from("denials").insert(row).select("*").single();
      if (error) throw new Error(`denials.insert: ${error.message}`);
      return denialRowToDomain(data);
    },
    async update(tenantId, id, patch) {
      const { data, error } = await admin
        .from("denials")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", id as string)
        .select("*")
        .single();
      if (error) throw new Error(`denials.update: ${error.message}`);
      return denialRowToDomain(data);
    },
    async list(tenantId, filter) {
      let q = admin
        .from("denials")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true })
        .range(filter.offset, filter.offset + filter.limit - 1);

      const statuses = filter.status ?? (["open", "working"] as const);
      q = q.in("status", [...statuses]);
      if (filter.priority) q = q.eq("priority", filter.priority);
      if (filter.claimId) q = q.eq("claim_id", filter.claimId as string);
      if (filter.onlyUnassigned) q = q.is("assigned_to", null);
      else if (filter.assignedTo) q = q.eq("assigned_to", filter.assignedTo as string);

      const { data, error } = await q;
      if (error) throw new Error(`denials.list: ${error.message}`);
      return (data ?? []).map(denialRowToDomain);
    },
    async getParentClaimStatus(tenantId, claimId) {
      const { data, error } = await admin
        .from("claims")
        .select("status")
        .eq("tenant_id", tenantId)
        .eq("id", claimId)
        .maybeSingle();
      if (error) throw new Error(`getParentClaimStatus: ${error.message}`);
      return (data?.status as ClaimStatus | undefined) ?? null;
    },
  };
}

// ===========================================================================
// Claim data access
// ===========================================================================

/** Richer shape used by `ClaimService.getById` — includes joined patient + payer + lines + history. */
export interface ClaimBundle {
  claim: Row<"claims"> & {
    patient: Pick<Row<"patients">, "id" | "given_name" | "family_name"> | null;
    payer: Pick<Row<"payers">, "id" | "name"> | null;
  };
  lines: readonly Row<"claim_lines">[];
  history: readonly Row<"claim_status_history">[];
}

export interface ClaimDataAccess {
  list(
    tenantId: string,
    filter: {
      status?: readonly ClaimStatus[];
      patientId?: PatientId;
      payerId?: string;
      serviceStartAfter?: string;
      serviceEndBefore?: string;
      limit: number;
      offset: number;
    },
  ): Promise<readonly Row<"claims">[]>;

  getBundle(tenantId: string, id: string): Promise<ClaimBundle | null>;

  getStatus(tenantId: string, id: string): Promise<ClaimStatus | null>;

  /** Insert claim + lines atomically — service uses this for createFromCharges. */
  insertClaimWithLines(params: {
    claim: Insert<"claims">;
    lines: readonly Insert<"claim_lines">[];
  }): Promise<ClaimBundle>;

  updateStatus(tenantId: string, id: string, patch: Update<"claims">): Promise<Row<"claims">>;

  insertHistory(row: Insert<"claim_status_history">): Promise<void>;

  /** For createFromCharges: verify all chargeIds are `posted` and belong to the tenant. */
  getChargesForClaim(
    tenantId: string,
    chargeIds: readonly string[],
  ): Promise<readonly Row<"charges">[]>;

  /** Flip charges to `billed` once the claim is submitted/ready. */
  markChargesBilled(tenantId: string, chargeIds: readonly string[]): Promise<void>;
}

export function makeSupabaseClaimData(admin: SupabaseAdminClient): ClaimDataAccess {
  return {
    async list(tenantId, filter) {
      let q = admin
        .from("claims")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .range(filter.offset, filter.offset + filter.limit - 1);

      if (filter.status && filter.status.length > 0) {
        q = q.in("status", [...filter.status]);
      }
      if (filter.patientId) q = q.eq("patient_id", filter.patientId as string);
      if (filter.payerId) q = q.eq("payer_id", filter.payerId);
      if (filter.serviceStartAfter) q = q.gte("service_start_date", filter.serviceStartAfter);
      if (filter.serviceEndBefore) q = q.lte("service_end_date", filter.serviceEndBefore);

      const { data, error } = await q;
      if (error) throw new Error(`claims.list: ${error.message}`);
      return data ?? [];
    },

    async getBundle(tenantId, id) {
      const [claimRes, linesRes, histRes] = await Promise.all([
        admin
          .from("claims")
          .select("*, patient:patient_id(id, given_name, family_name), payer:payer_id(id, name)")
          .eq("tenant_id", tenantId)
          .eq("id", id)
          .maybeSingle(),
        admin
          .from("claim_lines")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("claim_id", id)
          .order("line_number", { ascending: true }),
        admin
          .from("claim_status_history")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("claim_id", id)
          .order("occurred_at", { ascending: false }),
      ]);

      if (claimRes.error) throw new Error(`claims.getBundle: ${claimRes.error.message}`);
      const claim = claimRes.data as ClaimBundle["claim"] | null;
      if (!claim) return null;

      return {
        claim,
        lines: linesRes.data ?? [],
        history: histRes.data ?? [],
      };
    },

    async getStatus(tenantId, id) {
      const { data, error } = await admin
        .from("claims")
        .select("status")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`claims.getStatus: ${error.message}`);
      return (data?.status as ClaimStatus | undefined) ?? null;
    },

    async insertClaimWithLines(params) {
      const claimResult = await admin
        .from("claims")
        .insert(params.claim)
        .select("*, patient:patient_id(id, given_name, family_name), payer:payer_id(id, name)")
        .single();
      if (claimResult.error) throw new Error(`claims.insert: ${claimResult.error.message}`);

      const claim = claimResult.data as ClaimBundle["claim"];

      if (params.lines.length > 0) {
        const linesWithId = params.lines.map((l) => ({ ...l, claim_id: claim.id }));
        const linesResult = await admin.from("claim_lines").insert(linesWithId).select("*");
        if (linesResult.error) {
          throw new Error(`claim_lines.insert: ${linesResult.error.message}`);
        }
        return {
          claim,
          lines: linesResult.data ?? [],
          history: [],
        };
      }
      return { claim, lines: [], history: [] };
    },

    async updateStatus(tenantId, id, patch) {
      const { data, error } = await admin
        .from("claims")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(`claims.updateStatus: ${error.message}`);
      return data;
    },

    async insertHistory(row) {
      const { error } = await admin.from("claim_status_history").insert(row);
      if (error) throw new Error(`claim_status_history.insert: ${error.message}`);
    },

    async getChargesForClaim(tenantId, chargeIds) {
      if (chargeIds.length === 0) return [];
      const { data, error } = await admin
        .from("charges")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("id", chargeIds as string[]);
      if (error) throw new Error(`getChargesForClaim: ${error.message}`);
      return data ?? [];
    },

    async markChargesBilled(tenantId, chargeIds) {
      if (chargeIds.length === 0) return;
      const { error } = await admin
        .from("charges")
        .update({ status: "billed", updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .in("id", chargeIds as string[]);
      if (error) throw new Error(`markChargesBilled: ${error.message}`);
    },
  };
}

// ===========================================================================
// Shared types re-exported for consumers
// ===========================================================================

export type { AICodeSource, AICodeType, Confidence };
