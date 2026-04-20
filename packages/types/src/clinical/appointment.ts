import { z } from "zod";

import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";

import { PatientIdSchema } from "./patient.js";

// ---------- IDs --------------------------------------------------------------

export const AppointmentIdSchema = z.string().uuid().brand<"AppointmentId">();
export type AppointmentId = z.infer<typeof AppointmentIdSchema>;

export const LocationIdSchema = z.string().uuid().brand<"LocationId">();
export type LocationId = z.infer<typeof LocationIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const AppointmentStatusSchema = z.enum([
  "scheduled",
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

export const VisitTypeSchema = z.enum(["in_person", "telehealth", "phone"]);
export type VisitType = z.infer<typeof VisitTypeSchema>;

// ---------- Appointment ------------------------------------------------------

export const AppointmentSchema = z.object({
  id: AppointmentIdSchema,
  tenantId: TenantIdSchema,
  patientId: PatientIdSchema,
  providerId: UserIdSchema,
  locationId: LocationIdSchema.nullable().optional(),
  encounterId: z.string().uuid().nullable().optional(), // brand imported lazily to avoid cycle
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  status: AppointmentStatusSchema,
  reason: z.string().max(1024).nullable().optional(),
  visitType: VisitTypeSchema.nullable().optional(),
  telehealthUrl: z.string().url().nullable().optional(),
  bookedBy: UserIdSchema.nullable().optional(),
  cancelledAt: z.string().datetime().nullable().optional(),
  cancelledReason: z.string().max(1024).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Appointment = z.infer<typeof AppointmentSchema>;

export const AppointmentCreateSchema = z
  .object({
    patientId: PatientIdSchema,
    providerId: UserIdSchema,
    locationId: LocationIdSchema.optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    reason: z.string().max(1024).optional(),
    visitType: VisitTypeSchema.default("in_person"),
  })
  .refine((v) => new Date(v.endAt).getTime() > new Date(v.startAt).getTime(), {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });
export type AppointmentCreate = z.infer<typeof AppointmentCreateSchema>;

export const AppointmentUpdateSchema = z
  .object({
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    reason: z.string().max(1024).nullable().optional(),
    visitType: VisitTypeSchema.optional(),
  })
  .refine((v) => !v.startAt || !v.endAt || new Date(v.endAt) > new Date(v.startAt), {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });
export type AppointmentUpdate = z.infer<typeof AppointmentUpdateSchema>;

export const AppointmentStatusTransitionSchema = z.object({
  status: AppointmentStatusSchema,
});
export type AppointmentStatusTransition = z.infer<typeof AppointmentStatusTransitionSchema>;

export const AppointmentCancelSchema = z.object({
  reason: z.string().min(1).max(1024),
});
export type AppointmentCancel = z.infer<typeof AppointmentCancelSchema>;

export const AppointmentListQuerySchema = z.object({
  date: z.string().date().optional(),
  providerId: UserIdSchema.optional(),
  patientId: PatientIdSchema.optional(),
  status: AppointmentStatusSchema.optional(),
});
export type AppointmentListQuery = z.infer<typeof AppointmentListQuerySchema>;

/**
 * Which statuses a given status can legally transition to. Enforce both in the
 * app layer and (future) via a SQL trigger.
 */
export const APPOINTMENT_STATUS_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ["confirmed", "arrived", "no_show", "cancelled", "rescheduled"],
  confirmed: ["arrived", "no_show", "cancelled", "rescheduled"],
  arrived: ["in_progress", "no_show", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
  rescheduled: [],
};
