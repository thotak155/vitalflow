import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import type { ChargeLine, EncounterId, Row } from "@vitalflow/types";

import type { AppSession } from "../../../../../lib/session.js";
import { dbRowToChargeLine, type ChargeDbRow } from "./dbMappers.js";

/**
 * Permissions derived from the session. Passed down to child components so
 * nothing re-checks individually.
 */
export interface ChargeCapturePermissions {
  readonly canView: boolean;
  readonly canCapture: boolean;
  readonly canVoid: boolean;
}

export interface EncounterDiagnosis {
  readonly code: string;
  readonly description: string;
  readonly rank: number;
}

export interface ChargeCaptureContext {
  readonly lines: readonly ChargeLine[];
  readonly encounterDiagnoses: readonly EncounterDiagnosis[];
  readonly permissions: ChargeCapturePermissions;
  /** Short-circuit flag when encounter is in a state that blocks post. */
  readonly encounterReadOnly: boolean;
}

/**
 * Single-pass fetch for the charge-capture card. Reads all charge lines,
 * the encounter's diagnosis assignments, and the encounter state in one
 * server-component render.
 */
export async function getChargeCaptureContext(
  encounterId: EncounterId,
  session: AppSession,
): Promise<ChargeCaptureContext> {
  const permissions = derivePermissions(session);
  if (!permissions.canView) {
    return {
      lines: [],
      encounterDiagnoses: [],
      permissions,
      encounterReadOnly: true,
    };
  }

  const supabase = await createVitalFlowServerClient();

  const [chargesRes, diagnosesRes, encounterRes] = await Promise.all([
    supabase
      .from("charges")
      .select(
        "id, tenant_id, patient_id, encounter_id, order_id, cpt_code, hcpcs_code, " +
          "revenue_code, icd10_codes, modifiers, units, unit_price_minor, total_minor, " +
          "currency, service_date, posted_at, posted_by, status, notes, metadata, " +
          "created_at, updated_at",
      )
      .eq("encounter_id", encounterId)
      .eq("tenant_id", session.tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("diagnosis_assignments")
      .select("code, description, rank, removed_at")
      .eq("encounter_id", encounterId)
      .eq("tenant_id", session.tenantId)
      .is("removed_at", null)
      .order("rank", { ascending: true }),
    supabase
      .from("encounters")
      .select("status")
      .eq("id", encounterId)
      .eq("tenant_id", session.tenantId)
      .maybeSingle(),
  ]);

  const lines = ((chargesRes.data as ChargeDbRow[] | null) ?? []).map(dbRowToChargeLine);

  const diagnoses = (
    (diagnosesRes.data as
      | Pick<Row<"diagnosis_assignments">, "code" | "description" | "rank">[]
      | null) ?? []
  ).map((row) => ({
    code: row.code,
    description: row.description,
    rank: row.rank,
  }));

  const encounterStatus =
    (encounterRes.data as Pick<Row<"encounters">, "status"> | null)?.status ?? null;
  const encounterReadOnly = encounterStatus === "cancelled";

  return {
    lines,
    encounterDiagnoses: diagnoses,
    permissions,
    encounterReadOnly,
  };
}

function derivePermissions(session: AppSession): ChargeCapturePermissions {
  const perms: readonly string[] = session.permissions;
  const has = (p: string) => perms.includes(p);
  const canView = has("billing:read") || has("charges:capture");
  const canCapture = has("billing:write") || has("charges:capture");
  const canVoid = has("billing:write");
  return { canView, canCapture, canVoid };
}
