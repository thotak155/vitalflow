import { z } from "zod";

import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";

import { EncounterIdSchema } from "./encounter.js";
import { PatientIdSchema } from "./patient.js";

// ---------- IDs --------------------------------------------------------------

export const ClinicalNoteIdSchema = z.string().uuid().brand<"ClinicalNoteId">();
export type ClinicalNoteId = z.infer<typeof ClinicalNoteIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const NoteTypeSchema = z.enum(["soap", "progress", "consult", "discharge", "addendum"]);
export type NoteType = z.infer<typeof NoteTypeSchema>;

export const NoteStatusSchema = z.enum(["draft", "pending_review", "signed", "amended"]);
export type NoteStatus = z.infer<typeof NoteStatusSchema>;

// ---------- ClinicalNote -----------------------------------------------------

export const ClinicalNoteSchema = z.object({
  id: ClinicalNoteIdSchema,
  tenantId: TenantIdSchema,
  encounterId: EncounterIdSchema,
  patientId: PatientIdSchema,
  authorId: UserIdSchema,
  type: NoteTypeSchema,
  status: NoteStatusSchema,
  subjective: z.string().max(65536).nullable().optional(),
  objective: z.string().max(65536).nullable().optional(),
  assessment: z.string().max(65536).nullable().optional(),
  plan: z.string().max(65536).nullable().optional(),
  freeText: z.string().max(65536).nullable().optional(),
  aiAssisted: z.boolean(),
  aiRequestId: z.string().uuid().nullable().optional(),
  signedBy: UserIdSchema.nullable().optional(),
  signedAt: z.string().datetime().nullable().optional(),
  amendedFrom: ClinicalNoteIdSchema.nullable().optional(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ClinicalNote = z.infer<typeof ClinicalNoteSchema>;

export const ClinicalNoteDraftCreateSchema = z.object({
  encounterId: EncounterIdSchema,
  patientId: PatientIdSchema,
  type: NoteTypeSchema.default("soap"),
  subjective: z.string().max(65536).optional(),
  objective: z.string().max(65536).optional(),
  assessment: z.string().max(65536).optional(),
  plan: z.string().max(65536).optional(),
  freeText: z.string().max(65536).optional(),
  aiAssisted: z.boolean().default(false),
  aiRequestId: z.string().uuid().optional(),
});
export type ClinicalNoteDraftCreate = z.infer<typeof ClinicalNoteDraftCreateSchema>;

export const ClinicalNoteDraftUpdateSchema = z.object({
  subjective: z.string().max(65536).nullable().optional(),
  objective: z.string().max(65536).nullable().optional(),
  assessment: z.string().max(65536).nullable().optional(),
  plan: z.string().max(65536).nullable().optional(),
  freeText: z.string().max(65536).nullable().optional(),
  /** Optimistic lock — latest value the client rendered. */
  ifUnmodifiedSince: z.string().datetime().optional(),
});
export type ClinicalNoteDraftUpdate = z.infer<typeof ClinicalNoteDraftUpdateSchema>;

export const NoteSignRequestSchema = z.object({
  attestation: z.string().min(1).max(1024).optional(),
});
export type NoteSignRequest = z.infer<typeof NoteSignRequestSchema>;

export const NoteAmendRequestSchema = z.object({
  reason: z.string().min(5).max(1024),
});
export type NoteAmendRequest = z.infer<typeof NoteAmendRequestSchema>;

// ---------- ClinicalNoteVersion (view over the same table) -------------------

/**
 * A "version" is simply a row in `encounter_notes` that participates in the
 * amendment chain. The "current" version is the one with `status != 'amended'`
 * and the highest `version` for a given encounter. "Historic" versions are
 * all other rows in the chain. The `clinical_notes_current` view (see SQL
 * follow-up) gives the one-current-per-encounter guarantee.
 */
export const ClinicalNoteVersionSchema = ClinicalNoteSchema.pick({
  id: true,
  encounterId: true,
  version: true,
  status: true,
  authorId: true,
  signedBy: true,
  signedAt: true,
  amendedFrom: true,
  updatedAt: true,
});
export type ClinicalNoteVersion = z.infer<typeof ClinicalNoteVersionSchema>;
