import { z } from "zod";

import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";

import { EncounterIdSchema } from "./encounter.js";
import { PatientIdSchema } from "./patient.js";

// ---------- IDs --------------------------------------------------------------

export const DiagnosisAssignmentIdSchema = z.string().uuid().brand<"DiagnosisAssignmentId">();
export type DiagnosisAssignmentId = z.infer<typeof DiagnosisAssignmentIdSchema>;

export const ProblemIdSchema = z.string().uuid().brand<"ProblemId">();
export type ProblemId = z.infer<typeof ProblemIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const CodeSystemSchema = z.enum(["icd10-cm", "icd11", "snomed-ct"]);
export type CodeSystem = z.infer<typeof CodeSystemSchema>;

export const PresentOnAdmissionSchema = z.enum(["Y", "N", "U", "W"]);
export type PresentOnAdmission = z.infer<typeof PresentOnAdmissionSchema>;

// ---------- DiagnosisAssignment ---------------------------------------------

/**
 * Encounter-scoped ICD-10 mapping used for claim generation and note finalization.
 * Distinct from public.problems which is the patient-level running problem list.
 * Not yet in the DB — see docs/clinical-domain.md §2.7 for the proposed table.
 */
export const DiagnosisAssignmentSchema = z.object({
  id: DiagnosisAssignmentIdSchema,
  tenantId: TenantIdSchema,
  patientId: PatientIdSchema,
  encounterId: EncounterIdSchema,
  problemId: ProblemIdSchema.nullable().optional(),
  codeSystem: CodeSystemSchema,
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/i, {
      message: "Expected ICD-10-CM format, e.g. E11.9",
    }),
  description: z.string().min(1).max(512),
  rank: z.number().int().min(1).max(12),
  pointer: z
    .string()
    .regex(/^[A-L]$/)
    .nullable()
    .optional(),
  presentOnAdmission: PresentOnAdmissionSchema.nullable().optional(),
  assignedBy: UserIdSchema,
  assignedAt: z.string().datetime(),
  removedAt: z.string().datetime().nullable().optional(),
});
export type DiagnosisAssignment = z.infer<typeof DiagnosisAssignmentSchema>;

export const DiagnosisAssignmentCreateSchema = z.object({
  codeSystem: CodeSystemSchema.default("icd10-cm"),
  code: DiagnosisAssignmentSchema.shape.code,
  description: DiagnosisAssignmentSchema.shape.description,
  rank: DiagnosisAssignmentSchema.shape.rank,
  pointer: DiagnosisAssignmentSchema.shape.pointer.optional(),
  presentOnAdmission: PresentOnAdmissionSchema.optional(),
  problemId: ProblemIdSchema.optional(),
});
export type DiagnosisAssignmentCreate = z.infer<typeof DiagnosisAssignmentCreateSchema>;

export const DiagnosisAssignmentUpdateSchema = DiagnosisAssignmentCreateSchema.partial();
export type DiagnosisAssignmentUpdate = z.infer<typeof DiagnosisAssignmentUpdateSchema>;

export const DiagnosisReorderSchema = z.object({
  /** Ordered list of assignment ids. Index 0 becomes rank 1. */
  ranks: z.array(DiagnosisAssignmentIdSchema).min(1).max(12),
});
export type DiagnosisReorder = z.infer<typeof DiagnosisReorderSchema>;
