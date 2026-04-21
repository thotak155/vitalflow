import { z } from "zod";

import { PatientCoverageIdSchema, PatientIdSchema, PayerIdSchema } from "../clinical/index.js";
import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";
import { ChargeIdSchema } from "./charge.js";

// Re-export so ERP consumers can find these without reaching into clinical.
export { PatientCoverageIdSchema, PayerIdSchema };
export type { PatientCoverageId, PayerId } from "../clinical/index.js";

// ---------- IDs --------------------------------------------------------------

export const ClaimIdSchema = z.string().uuid().brand<"ClaimId">();
export type ClaimId = z.infer<typeof ClaimIdSchema>;

export const ClaimLineIdSchema = z.string().uuid().brand<"ClaimLineId">();
export type ClaimLineId = z.infer<typeof ClaimLineIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const ClaimStatusSchema = z.enum([
  "draft",
  "ready",
  "submitted",
  "accepted",
  "rejected",
  "paid",
  "partial",
  "denied",
  "appealed",
  "closed",
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

// ---------- Schemas ----------------------------------------------------------

export const ClaimLineSchema = z.object({
  id: ClaimLineIdSchema,
  tenantId: TenantIdSchema,
  claimId: ClaimIdSchema,
  chargeId: ChargeIdSchema,
  lineNumber: z.number().int().positive(),
  cptCode: z
    .string()
    .regex(/^\d{5}$/)
    .nullable()
    .optional(),
  modifiers: z.array(z.string()).default([]),
  icd10Codes: z.array(z.string()).default([]),
  units: z.number().int().positive(),
  chargeMinor: z.number().int().nonnegative(),
  allowedMinor: z.number().int().nonnegative().nullable().optional(),
  paidMinor: z.number().int().nonnegative().default(0),
  adjustmentMinor: z.number().int().default(0),
  denialCodes: z.array(z.string()).default([]),
  currency: z.string().length(3).default("USD"),
  serviceDate: z.string().date(),
  createdAt: z.string().datetime(),
});
export type ClaimLine = z.infer<typeof ClaimLineSchema>;

export const ClaimSchema = z.object({
  id: ClaimIdSchema,
  tenantId: TenantIdSchema,
  patientId: PatientIdSchema,
  payerId: PayerIdSchema,
  coverageId: PatientCoverageIdSchema.nullable().optional(),
  number: z.string(),
  status: ClaimStatusSchema,
  billingProviderId: UserIdSchema.nullable().optional(),
  renderingProviderId: UserIdSchema.nullable().optional(),
  serviceStartDate: z.string().date(),
  serviceEndDate: z.string().date(),
  totalMinor: z.number().int().nonnegative(),
  allowedMinor: z.number().int().nonnegative().nullable().optional(),
  paidMinor: z.number().int().nonnegative().default(0),
  patientRespMinor: z.number().int().nonnegative().default(0),
  currency: z.string().length(3).default("USD"),
  submittedAt: z.string().datetime().nullable().optional(),
  adjudicatedAt: z.string().datetime().nullable().optional(),
  externalClaimId: z.string().nullable().optional(),
  ediEnvelope: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const ClaimStatusHistorySchema = z.object({
  id: z.string().uuid(),
  tenantId: TenantIdSchema,
  claimId: ClaimIdSchema,
  fromStatus: ClaimStatusSchema.nullable(),
  toStatus: ClaimStatusSchema,
  occurredAt: z.string().datetime(),
  actorId: UserIdSchema.nullable().optional(),
  message: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type ClaimStatusHistory = z.infer<typeof ClaimStatusHistorySchema>;

// ---------- Inputs -----------------------------------------------------------

export const CreateClaimFromChargesInputSchema = z.object({
  payerId: PayerIdSchema,
  coverageId: PatientCoverageIdSchema.nullable().optional(),
  chargeIds: z.array(ChargeIdSchema).min(1).max(50),
  billingProviderId: UserIdSchema.nullable().optional(),
  renderingProviderId: UserIdSchema.nullable().optional(),
});
export type CreateClaimFromChargesInput = z.infer<typeof CreateClaimFromChargesInputSchema>;

export const RemittanceLineSchema = z.object({
  claimLineId: ClaimLineIdSchema,
  allowedMinor: z.number().int().nonnegative(),
  paidMinor: z.number().int().nonnegative(),
  adjustmentMinor: z.number().int(),
  denialCodes: z.array(z.string()).default([]),
});
export type RemittanceLine = z.infer<typeof RemittanceLineSchema>;

export const ApplyRemittanceInputSchema = z.object({
  adjudicatedAt: z.string().datetime(),
  patientRespMinor: z.number().int().nonnegative().default(0),
  externalRemitId: z.string().optional(),
  lines: z.array(RemittanceLineSchema).min(1),
});
export type ApplyRemittanceInput = z.infer<typeof ApplyRemittanceInputSchema>;

export const AppealClaimInputSchema = z.object({
  reason: z.string().min(5).max(2000),
  supportingDocs: z.array(z.string()).default([]),
});
export type AppealClaimInput = z.infer<typeof AppealClaimInputSchema>;

export const CloseClaimInputSchema = z.object({
  reason: z.string().min(5).max(500),
});
export type CloseClaimInput = z.infer<typeof CloseClaimInputSchema>;
