import type { SupabaseAdminClient } from "@vitalflow/auth/admin";
import type {
  ChargeDataAccess,
  ChargeLineInsertRow,
  ChargeLineUpdatePatch,
} from "@vitalflow/erp-service";
import type { EncounterId, Insert, Row, Update, WithRelation } from "@vitalflow/types";

import { dbRowToChargeLine, type ChargeDbRow } from "./dbMappers.js";

/**
 * Build a `ChargeDataAccess` backed by the typed Supabase admin client.
 * Keeps SQL details out of ChargeServiceImpl; the service stays pure
 * business logic.
 *
 * The `admin` client is typed as `SupabaseClient<Database>`, so `.from()`
 * calls return rows shaped per the generated `supabase.generated.ts`.
 * Callers are responsible for tenant scoping (service methods always pass
 * tenantId explicitly).
 */
export function makeSupabaseChargeData(admin: SupabaseAdminClient): ChargeDataAccess {
  return {
    async listByEncounter(tenantId: string, encounterId: EncounterId) {
      const { data, error } = await admin
        .from("charges")
        .select("*")
        .eq("encounter_id", encounterId as string)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`listByEncounter: ${error.message}`);
      return (data ?? []).map((r) => dbRowToChargeLine(r as ChargeDbRow));
    },

    async getById(tenantId, id) {
      const { data, error } = await admin
        .from("charges")
        .select("*")
        .eq("id", id as string)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw new Error(`getById: ${error.message}`);
      return data ? dbRowToChargeLine(data as ChargeDbRow) : null;
    },

    async insert(row: ChargeLineInsertRow) {
      const { data, error } = await admin
        .from("charges")
        .insert(toDbInsert(row))
        .select("*")
        .single();
      if (error) throw new Error(`insert: ${error.message}`);
      return dbRowToChargeLine(data as ChargeDbRow);
    },

    async update(tenantId, id, patch) {
      const { data, error } = await admin
        .from("charges")
        .update(toDbUpdate(patch))
        .eq("id", id as string)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw new Error(`update: ${error.message}`);
      return dbRowToChargeLine(data as ChargeDbRow);
    },

    async delete(tenantId, id) {
      const { error } = await admin
        .from("charges")
        .delete()
        .eq("id", id as string)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(`delete: ${error.message}`);
    },

    async isLineOnSubmittedClaim(tenantId, chargeId) {
      const { data, error } = await admin
        .from("claim_lines")
        .select("claim_id, claim:claim_id(status)")
        .eq("charge_id", chargeId as string)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(`isLineOnSubmittedClaim: ${error.message}`);
      if (!data || data.length === 0) return false;

      type ClaimJoin = WithRelation<
        Pick<Row<"claim_lines">, "claim_id">,
        "claim",
        Pick<Row<"claims">, "status"> | null
      >;
      const blockingStates = new Set([
        "submitted",
        "accepted",
        "paid",
        "partial",
        "denied",
        "appealed",
      ]);
      return (data as ClaimJoin[]).some((row) => row.claim && blockingStates.has(row.claim.status));
    },

    async listEncounterDiagnosisCodes(tenantId, encounterId) {
      const { data, error } = await admin
        .from("diagnosis_assignments")
        .select("code")
        .eq("tenant_id", tenantId)
        .eq("encounter_id", encounterId as string)
        .is("removed_at", null);
      if (error) throw new Error(`listEncounterDiagnosisCodes: ${error.message}`);
      return (data ?? []).map((r) => r.code);
    },
  };
}

// ---------------------------------------------------------------------------
// Camel → snake mappers, typed against the generated Insert/Update shapes
// ---------------------------------------------------------------------------

function toDbInsert(row: ChargeLineInsertRow): Insert<"charges"> {
  return {
    tenant_id: row.tenantId,
    patient_id: row.patientId,
    encounter_id: row.encounterId ?? null,
    order_id: row.orderId ?? null,
    cpt_code: row.cptCode ?? null,
    hcpcs_code: row.hcpcsCode ?? null,
    revenue_code: row.revenueCode ?? null,
    icd10_codes: [...row.icd10Codes],
    modifiers: [...row.modifiers],
    units: row.units,
    unit_price_minor: row.unitPriceMinor,
    currency: row.currency,
    service_date: row.serviceDate,
    notes: row.notes ?? null,
    status: row.status,
  };
}

function toDbUpdate(patch: ChargeLineUpdatePatch): Update<"charges"> {
  const out: Update<"charges"> = {};
  if (patch.patientId !== undefined) out.patient_id = patch.patientId;
  if (patch.encounterId !== undefined) out.encounter_id = patch.encounterId;
  if (patch.orderId !== undefined) out.order_id = patch.orderId;
  if (patch.cptCode !== undefined) out.cpt_code = patch.cptCode;
  if (patch.hcpcsCode !== undefined) out.hcpcs_code = patch.hcpcsCode;
  if (patch.revenueCode !== undefined) out.revenue_code = patch.revenueCode;
  if (patch.icd10Codes !== undefined) out.icd10_codes = [...patch.icd10Codes];
  if (patch.modifiers !== undefined) out.modifiers = [...patch.modifiers];
  if (patch.units !== undefined) out.units = patch.units;
  if (patch.unitPriceMinor !== undefined) out.unit_price_minor = patch.unitPriceMinor;
  if (patch.currency !== undefined) out.currency = patch.currency;
  if (patch.serviceDate !== undefined) out.service_date = patch.serviceDate;
  if (patch.notes !== undefined) out.notes = patch.notes;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.postedAt !== undefined) out.posted_at = patch.postedAt;
  if (patch.postedBy !== undefined) out.posted_by = patch.postedBy;
  return out;
}
