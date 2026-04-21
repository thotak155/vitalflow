import { z } from "zod";

import { TenantIdSchema } from "../tenancy/index.js";

// ---------- IDs --------------------------------------------------------------

export const PatientIdSchema = z.string().uuid().brand<"PatientId">();
export type PatientId = z.infer<typeof PatientIdSchema>;

export const PatientContactIdSchema = z.string().uuid().brand<"PatientContactId">();
export type PatientContactId = z.infer<typeof PatientContactIdSchema>;

export const PayerIdSchema = z.string().uuid().brand<"PayerId">();
export type PayerId = z.infer<typeof PayerIdSchema>;

export const PatientCoverageIdSchema = z.string().uuid().brand<"PatientCoverageId">();
export type PatientCoverageId = z.infer<typeof PatientCoverageIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const SexAtBirthSchema = z.enum(["male", "female", "intersex", "unknown"]);
export type SexAtBirth = z.infer<typeof SexAtBirthSchema>;

export const ContactTypeSchema = z.enum([
  "phone_home",
  "phone_mobile",
  "phone_work",
  "email",
  "address",
]);
export type ContactType = z.infer<typeof ContactTypeSchema>;

export const CoverageTypeSchema = z.enum([
  "primary",
  "secondary",
  "tertiary",
  "self_pay",
  "workers_comp",
  "auto",
  "other",
]);
export type CoverageType = z.infer<typeof CoverageTypeSchema>;

// ---------- Patient ----------------------------------------------------------

export const PatientSchema = z.object({
  id: PatientIdSchema,
  tenantId: TenantIdSchema,
  mrn: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  givenName: z.string().min(1).max(128),
  familyName: z.string().min(1).max(128),
  preferredName: z.string().max(128).nullable().optional(),
  dateOfBirth: z.string().date(),
  sexAtBirth: SexAtBirthSchema,
  genderIdentity: z.string().max(64).nullable().optional(),
  pronouns: z.string().max(32).nullable().optional(),
  preferredLanguage: z.string().max(16).nullable().optional(),
  ssnLast4: z
    .string()
    .regex(/^\d{4}$/)
    .nullable()
    .optional(),
  deceasedAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Patient = z.infer<typeof PatientSchema>;

export const PatientCreateSchema = PatientSchema.pick({
  givenName: true,
  familyName: true,
  preferredName: true,
  dateOfBirth: true,
  sexAtBirth: true,
  genderIdentity: true,
  pronouns: true,
  preferredLanguage: true,
}).extend({
  mrn: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(), // server auto-generates if blank
});
export type PatientCreate = z.infer<typeof PatientCreateSchema>;

export const PatientUpdateSchema = PatientSchema.pick({
  givenName: true,
  familyName: true,
  preferredName: true,
  pronouns: true,
  genderIdentity: true,
  preferredLanguage: true,
}).partial();
export type PatientUpdate = z.infer<typeof PatientUpdateSchema>;

export const PatientListQuerySchema = z.object({
  q: z.string().max(128).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
});
export type PatientListQuery = z.infer<typeof PatientListQuerySchema>;

// ---------- Contacts ---------------------------------------------------------

export const PatientContactSchema = z.object({
  id: PatientContactIdSchema,
  tenantId: TenantIdSchema,
  patientId: PatientIdSchema,
  type: ContactTypeSchema,
  value: z.string().min(1).max(512),
  isPrimary: z.boolean().default(false),
  verifiedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type PatientContact = z.infer<typeof PatientContactSchema>;

export const PatientContactCreateSchema = PatientContactSchema.pick({
  type: true,
  value: true,
  isPrimary: true,
});
export type PatientContactCreate = z.infer<typeof PatientContactCreateSchema>;

// ---------- Insurance (PatientCoverage) --------------------------------------

export const PayerSchema = z.object({
  id: PayerIdSchema,
  tenantId: TenantIdSchema,
  name: z.string().min(1).max(128),
  payerCode: z.string().max(32).nullable().optional(),
  active: z.boolean(),
});
export type Payer = z.infer<typeof PayerSchema>;

export const PatientInsuranceSchema = z.object({
  id: PatientCoverageIdSchema,
  tenantId: TenantIdSchema,
  patientId: PatientIdSchema,
  payerId: PayerIdSchema,
  type: CoverageTypeSchema,
  planName: z.string().max(128).nullable().optional(),
  memberId: z.string().min(1).max(64),
  groupNumber: z.string().max(64).nullable().optional(),
  subscriberName: z.string().max(256).nullable().optional(),
  relationship: z.enum(["self", "spouse", "child", "other"]).nullable().optional(),
  effectiveStart: z.string().date().nullable().optional(),
  effectiveEnd: z.string().date().nullable().optional(),
  copayMinor: z.number().int().nonnegative().nullable().optional(),
  deductibleMinor: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).default("USD"),
  active: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PatientInsurance = z.infer<typeof PatientInsuranceSchema>;

export const PatientInsuranceCreateSchema = PatientInsuranceSchema.pick({
  payerId: true,
  type: true,
  planName: true,
  memberId: true,
  groupNumber: true,
  subscriberName: true,
  relationship: true,
  effectiveStart: true,
  effectiveEnd: true,
  copayMinor: true,
  deductibleMinor: true,
  currency: true,
});
export type PatientInsuranceCreate = z.infer<typeof PatientInsuranceCreateSchema>;

export const PatientInsuranceUpdateSchema = PatientInsuranceCreateSchema.partial().extend({
  active: z.boolean().optional(),
});
export type PatientInsuranceUpdate = z.infer<typeof PatientInsuranceUpdateSchema>;
