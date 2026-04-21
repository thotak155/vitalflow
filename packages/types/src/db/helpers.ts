import type { Database } from "./supabase.generated.js";

/**
 * Type helpers on top of the generated Database definition. Use these
 * everywhere instead of hand-writing `DbXxxRow` interfaces — the generated
 * source of truth catches schema drift at compile time.
 *
 * Usage:
 *
 *   import type { Row, Insert, Update } from "@vitalflow/types/db";
 *   const charge: Row<"charges"> = ...;
 *   const newClaim: Insert<"claims"> = { tenant_id, ... };
 *
 * Joined-row helpers (see `WithRelation`) let you annotate Supabase query
 * results that include nested `.select("id, patient:patient_id(name)")`
 * syntax without reaching back to `as unknown as`.
 */

export type PublicSchema = Database["public"];
export type TableName = keyof PublicSchema["Tables"];
export type ViewName = keyof PublicSchema["Views"];

// --------- Row / Insert / Update ------------------------------------------

export type Row<T extends TableName> = PublicSchema["Tables"][T]["Row"];
export type Insert<T extends TableName> = PublicSchema["Tables"][T]["Insert"];
export type Update<T extends TableName> = PublicSchema["Tables"][T]["Update"];

export type ViewRow<V extends ViewName> = PublicSchema["Views"][V]["Row"];

// --------- Joined row helper ----------------------------------------------

/**
 * Annotate a row with a nested related object. Use for Supabase queries that
 * select a foreign-key relation by alias, e.g. `patient:patient_id(...)`.
 *
 *   type ClaimWithPatient = WithRelation<
 *     Row<"claims">,
 *     "patient",
 *     Pick<Row<"patients">, "id" | "given_name" | "family_name"> | null
 *   >;
 *
 * The row keeps all its own columns and gains `patient` as the relation.
 */
export type WithRelation<TRow, K extends string, TValue> = TRow & { readonly [P in K]: TValue };

// --------- Result helpers --------------------------------------------------

/**
 * Typed result shape for Supabase single-row queries. Wraps the library's
 * raw response so callers don't have to spell out the union each time.
 */
export interface SupabaseSingleResult<T> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

/** Same, for list queries. */
export interface SupabaseListResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
}

// --------- Enums -----------------------------------------------------------

export type PublicEnum<E extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][E];

// --------- Narrowing helpers -----------------------------------------------

/** Assert that a value is non-null; throws VitalFlowError if null. Placeholder — callers can import from shared-utils directly. */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
