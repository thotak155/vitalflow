import { z } from "zod";

import { EncounterIdSchema, PatientIdSchema } from "../clinical/index.js";
import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";

// ---------- IDs --------------------------------------------------------------

export const ChargeIdSchema = z.string().uuid().brand<"ChargeId">();
export type ChargeId = z.infer<typeof ChargeIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const ChargeStatusSchema = z.enum(["draft", "posted", "billed", "voided"]);
export type ChargeStatus = z.infer<typeof ChargeStatusSchema>;

export const ChargeRollupStatusSchema = z.enum([
  "empty",
  "draft",
  "ready_for_claim",
  "on_claim",
  "voided",
]);
export type ChargeRollupStatus = z.infer<typeof ChargeRollupStatusSchema>;

// ---------- Code shape -------------------------------------------------------

const CptCodeSchema = z
  .string()
  .regex(/^\d{5}$/)
  .describe("5-digit CPT code");
const HcpcsCodeSchema = z
  .string()
  .regex(/^[A-V]\d{4}$/)
  .describe("HCPCS Level II code");
const Icd10CodeSchema = z
  .string()
  .regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/)
  .describe("ICD-10-CM code");
const ModifierSchema = z
  .string()
  .regex(/^\d{2}$|^[A-Z]{2}$/)
  .describe("CPT modifier");

// ---------- ChargeLine (persisted row) --------------------------------------

/**
 * A ChargeLine is a single CPT/HCPCS row on an encounter. Rows are created
 * during/after an encounter and flow through draft → posted → billed.
 *
 * The "Charge" (aggregate) is the set of ChargeLines for an encounter —
 * computed by the service layer, not persisted separately.
 */
export const ChargeLineSchema = z.object({
  id: ChargeIdSchema,
  tenantId: TenantIdSchema,
  patientId: PatientIdSchema,
  encounterId: EncounterIdSchema.nullable(),
  orderId: z.string().uuid().nullable().optional(),
  cptCode: CptCodeSchema.nullable().optional(),
  hcpcsCode: HcpcsCodeSchema.nullable().optional(),
  revenueCode: z.string().max(8).nullable().optional(),
  icd10Codes: z.array(Icd10CodeSchema).max(12).default([]),
  modifiers: z.array(ModifierSchema).max(4).default([]),
  units: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  currency: z.string().length(3).default("USD"),
  serviceDate: z.string().date(),
  postedAt: z.string().datetime().nullable().optional(),
  postedBy: UserIdSchema.nullable().optional(),
  status: ChargeStatusSchema,
  notes: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ChargeLine = z.infer<typeof ChargeLineSchema>;

// ---------- Charge (aggregate view) ------------------------------------------

/**
 * Computed view over ChargeLines for an encounter. Not a database row.
 */
export const ChargeSchema = z.object({
  encounterId: EncounterIdSchema,
  patientId: PatientIdSchema,
  serviceDate: z.string().date(),
  lines: z.array(ChargeLineSchema),
  totalMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  /**
   * Derived rollup over the lines for this encounter. See
   * docs/charge-capture.md §2 for the state table.
   */
  rollupStatus: ChargeRollupStatusSchema,
});
export type Charge = z.infer<typeof ChargeSchema>;

// ---------- Inputs -----------------------------------------------------------

export const CreateChargeLineInputSchema = z
  .object({
    patientId: PatientIdSchema,
    encounterId: EncounterIdSchema.nullable(),
    orderId: z.string().uuid().nullable().optional(),
    cptCode: CptCodeSchema.nullable().optional(),
    hcpcsCode: HcpcsCodeSchema.nullable().optional(),
    revenueCode: z.string().max(8).nullable().optional(),
    icd10Codes: z.array(Icd10CodeSchema).max(12).default([]),
    modifiers: z.array(ModifierSchema).max(4).default([]),
    units: z.number().int().positive(),
    unitPriceMinor: z.number().int().nonnegative(),
    currency: z.string().length(3).default("USD"),
    serviceDate: z.string().date(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => !!(v.cptCode || v.hcpcsCode), {
    message: "Either cptCode or hcpcsCode is required",
    path: ["cptCode"],
  });
export type CreateChargeLineInput = z.infer<typeof CreateChargeLineInputSchema>;

export const UpdateChargeLineInputSchema = CreateChargeLineInputSchema.innerType().partial();
export type UpdateChargeLineInput = z.infer<typeof UpdateChargeLineInputSchema>;

export const VoidChargeInputSchema = z.object({
  reason: z.string().min(5).max(500),
});
export type VoidChargeInput = z.infer<typeof VoidChargeInputSchema>;
