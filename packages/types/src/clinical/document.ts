import { z } from "zod";

import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";

import { EncounterIdSchema } from "./encounter.js";
import { PatientIdSchema } from "./patient.js";

// ---------- IDs --------------------------------------------------------------

export const ClinicalDocumentIdSchema = z.string().uuid().brand<"ClinicalDocumentId">();
export type ClinicalDocumentId = z.infer<typeof ClinicalDocumentIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const DocumentKindSchema = z.enum([
  "note_pdf",
  "lab_report",
  "imaging_report",
  "discharge_summary",
  "intake_form",
  "consent",
  "identification",
  "insurance_card",
  "other",
]);
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

export const DocumentSourceSchema = z.enum(["upload", "generated", "ehr_import", "fax"]);
export type DocumentSource = z.infer<typeof DocumentSourceSchema>;

// ---------- ClinicalDocument -------------------------------------------------

/**
 * Extension of `public.attachments`. Fields marked "NEW" require a migration
 * adding the columns — see docs/clinical-domain.md §2.8. Existing `attachments`
 * rows without these fields are still valid (kind=`other`, source=`upload`).
 */
export const ClinicalDocumentSchema = z.object({
  id: ClinicalDocumentIdSchema,
  tenantId: TenantIdSchema,
  patientId: PatientIdSchema.nullable().optional(),
  encounterId: EncounterIdSchema.nullable().optional(),
  uploadedBy: UserIdSchema.nullable().optional(),
  storageBucket: z.string().min(1).max(64),
  storagePath: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  label: z.string().max(256).nullable().optional(),
  category: z.string().max(64).nullable().optional(),
  // NEW columns — see migration follow-up
  kind: DocumentKindSchema.default("other"),
  source: DocumentSourceSchema.default("upload"),
  signedBy: UserIdSchema.nullable().optional(),
  signedAt: z.string().datetime().nullable().optional(),
  effectiveDate: z.string().date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
});
export type ClinicalDocument = z.infer<typeof ClinicalDocumentSchema>;

export const ClinicalDocumentUploadSchema = z.object({
  patientId: PatientIdSchema.optional(),
  encounterId: EncounterIdSchema.optional(),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().nonnegative().max(128 * 1024 * 1024), // 128 MB cap
  kind: DocumentKindSchema.default("other"),
  source: DocumentSourceSchema.default("upload"),
  label: z.string().max(256).optional(),
  category: z.string().max(64).optional(),
  effectiveDate: z.string().date().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export type ClinicalDocumentUpload = z.infer<typeof ClinicalDocumentUploadSchema>;

export const ClinicalDocumentSignSchema = z.object({
  attestation: z.string().max(1024).optional(),
});
export type ClinicalDocumentSign = z.infer<typeof ClinicalDocumentSignSchema>;

export const ClinicalDocumentListQuerySchema = z.object({
  patientId: PatientIdSchema.optional(),
  encounterId: EncounterIdSchema.optional(),
  kind: DocumentKindSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ClinicalDocumentListQuery = z.infer<typeof ClinicalDocumentListQuerySchema>;
