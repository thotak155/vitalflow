import { z } from "zod";

import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";

import { PatientIdSchema } from "./patient.js";

// ---------- IDs --------------------------------------------------------------

export const EncounterIdSchema = z.string().uuid().brand<"EncounterId">();
export type EncounterId = z.infer<typeof EncounterIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const EncounterClassSchema = z.enum(["ambulatory", "emergency", "inpatient", "virtual"]);
export type EncounterClass = z.infer<typeof EncounterClassSchema>;

export const EncounterStatusSchema = z.enum([
  "planned",
  "arrived",
  "in_progress",
  "finished",
  "cancelled",
]);
export type EncounterStatus = z.infer<typeof EncounterStatusSchema>;

// ---------- Encounter --------------------------------------------------------

export const EncounterSchema = z.object({
  id: EncounterIdSchema,
  tenantId: TenantIdSchema,
  patientId: PatientIdSchema,
  providerId: UserIdSchema,
  class: EncounterClassSchema,
  status: EncounterStatusSchema,
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
  location: z.string().max(128).nullable().optional(),
  chiefComplaint: z.string().max(2048).nullable().optional(),
  reason: z.string().max(2048).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Encounter = z.infer<typeof EncounterSchema>;

export const EncounterCreateSchema = z.object({
  patientId: PatientIdSchema,
  providerId: UserIdSchema,
  class: EncounterClassSchema.default("ambulatory"),
  startAt: z.string().datetime(),
  reason: z.string().max(2048).optional(),
  chiefComplaint: z.string().max(2048).optional(),
});
export type EncounterCreate = z.infer<typeof EncounterCreateSchema>;

export const EncounterUpdateSchema = z.object({
  status: EncounterStatusSchema.optional(),
  reason: z.string().max(2048).nullable().optional(),
  chiefComplaint: z.string().max(2048).nullable().optional(),
});
export type EncounterUpdate = z.infer<typeof EncounterUpdateSchema>;

export const EncounterListQuerySchema = z.object({
  mine: z.boolean().default(true),
  status: EncounterStatusSchema.optional(),
  patientId: PatientIdSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type EncounterListQuery = z.infer<typeof EncounterListQuerySchema>;

export const ENCOUNTER_STATUS_TRANSITIONS: Record<EncounterStatus, readonly EncounterStatus[]> = {
  planned: ["arrived", "in_progress", "cancelled"],
  arrived: ["in_progress", "cancelled"],
  in_progress: ["finished", "cancelled"],
  finished: [],
  cancelled: [],
};
