import type {
  ChargeId,
  ChargeLine,
  ChargeStatus,
  EncounterId,
  PatientId,
  Row,
  TenantId,
  UserId,
} from "@vitalflow/types";

/**
 * Row shape from `.from("charges").select(...)`. Derived from the generated
 * Database type so schema drift is caught at compile time.
 */
export type ChargeDbRow = Row<"charges">;

export function dbRowToChargeLine(row: ChargeDbRow): ChargeLine {
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
