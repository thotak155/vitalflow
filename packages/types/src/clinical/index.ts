import { z } from "zod";

import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";

export const PatientIdSchema = z.string().uuid().brand<"PatientId">();
export type PatientId = z.infer<typeof PatientIdSchema>;

export const EncounterIdSchema = z.string().uuid().brand<"EncounterId">();
export type EncounterId = z.infer<typeof EncounterIdSchema>;

export const SexAtBirthSchema = z.enum(["male", "female", "intersex", "unknown"]);
export type SexAtBirth = z.infer<typeof SexAtBirthSchema>;

export const PatientSchema = z.object({
  id: PatientIdSchema,
  tenantId: TenantIdSchema,
  mrn: z.string().min(1).max(64),
  givenName: z.string().min(1),
  familyName: z.string().min(1),
  dateOfBirth: z.string().date(),
  sexAtBirth: SexAtBirthSchema,
  email: z.string().email().optional(),
  phone: z.string().optional(),
});
export type Patient = z.infer<typeof PatientSchema>;

export const EncounterStatusSchema = z.enum([
  "planned",
  "arrived",
  "in-progress",
  "finished",
  "cancelled",
]);

export const EncounterSchema = z.object({
  id: EncounterIdSchema,
  tenantId: TenantIdSchema,
  patientId: PatientIdSchema,
  providerId: UserIdSchema,
  status: EncounterStatusSchema,
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional(),
  reason: z.string().max(1024).optional(),
});
export type Encounter = z.infer<typeof EncounterSchema>;
