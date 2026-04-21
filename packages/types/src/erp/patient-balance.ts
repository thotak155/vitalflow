import { z } from "zod";

import { PatientIdSchema } from "../clinical/index.js";
import { TenantIdSchema } from "../tenancy/index.js";

// ---------- IDs --------------------------------------------------------------

export const PatientBalanceIdSchema = z.string().uuid().brand<"PatientBalanceId">();
export type PatientBalanceId = z.infer<typeof PatientBalanceIdSchema>;

// ---------- Schema -----------------------------------------------------------

export const PatientBalanceSchema = z.object({
  id: PatientBalanceIdSchema,
  tenantId: TenantIdSchema,
  patientId: PatientIdSchema,
  currentBalanceMinor: z.number().int(),
  aging0_30Minor: z.number().int().nonnegative(),
  aging31_60Minor: z.number().int().nonnegative(),
  aging61_90Minor: z.number().int().nonnegative(),
  agingOver90Minor: z.number().int().nonnegative(),
  currency: z.string().length(3).default("USD"),
  lastStatementAt: z.string().datetime().nullable().optional(),
  lastPaymentAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PatientBalance = z.infer<typeof PatientBalanceSchema>;

// ---------- Aging band (for filters + UI) -----------------------------------

export const AgingBandSchema = z.enum(["0-30", "31-60", "61-90", "over-90"]);
export type AgingBand = z.infer<typeof AgingBandSchema>;

// ---------- Dashboard list filter -------------------------------------------

export const BalanceListFilterSchema = z.object({
  minBalanceMinor: z.number().int().optional(),
  maxBalanceMinor: z.number().int().optional(),
  band: AgingBandSchema.optional(),
  sort: z.enum(["over90_desc", "current_desc", "updated_desc"]).default("over90_desc"),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type BalanceListFilter = z.infer<typeof BalanceListFilterSchema>;

// ---------- Delta input (internal — used by services) -----------------------

export const BalanceDeltaInputSchema = z.object({
  patientId: PatientIdSchema,
  deltaMinor: z.number().int(),
  band: AgingBandSchema.default("0-30"),
  touchPayment: z.boolean().default(false),
});
export type BalanceDeltaInput = z.infer<typeof BalanceDeltaInputSchema>;
