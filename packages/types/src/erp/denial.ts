import { z } from "zod";

import { TenantIdSchema, UserIdSchema } from "../tenancy/index.js";
import { ClaimIdSchema, ClaimLineIdSchema } from "./claim.js";

// ---------- IDs --------------------------------------------------------------

export const DenialIdSchema = z.string().uuid().brand<"DenialId">();
export type DenialId = z.infer<typeof DenialIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const DenialStatusSchema = z.enum([
  "open",
  "working",
  "appealed",
  "resolved",
  "written_off",
  "uncollectable",
]);
export type DenialStatus = z.infer<typeof DenialStatusSchema>;

export const DenialPrioritySchema = z.number().int().min(1).max(5).describe("1 = urgent, 5 = low");
export type DenialPriority = z.infer<typeof DenialPrioritySchema>;

// ---------- Schemas ----------------------------------------------------------

export const DenialSchema = z.object({
  id: DenialIdSchema,
  tenantId: TenantIdSchema,
  claimId: ClaimIdSchema,
  claimLineId: ClaimLineIdSchema.nullable().optional(),
  denialCodes: z.array(z.string()).max(10),
  reasonText: z.string().max(1000).nullable().optional(),
  status: DenialStatusSchema,
  priority: DenialPrioritySchema,
  assignedTo: UserIdSchema.nullable().optional(),
  assignedAt: z.string().datetime().nullable().optional(),
  workNote: z.string().max(4000).nullable().optional(),
  resolution: z.string().max(1000).nullable().optional(),
  deniedAmountMinor: z.number().int().nonnegative(),
  recoveredAmountMinor: z.number().int().nonnegative().default(0),
  currency: z.string().length(3).default("USD"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Denial = z.infer<typeof DenialSchema>;

// ---------- Inputs -----------------------------------------------------------

export const CreateDenialInputSchema = z.object({
  claimId: ClaimIdSchema,
  claimLineId: ClaimLineIdSchema.nullable().optional(),
  denialCodes: z.array(z.string()).min(1).max(10),
  reasonText: z.string().max(1000).optional(),
  priority: DenialPrioritySchema.default(3),
  deniedAmountMinor: z.number().int().nonnegative(),
});
export type CreateDenialInput = z.infer<typeof CreateDenialInputSchema>;

export const AssignDenialInputSchema = z.object({
  assignedTo: UserIdSchema,
});
export type AssignDenialInput = z.infer<typeof AssignDenialInputSchema>;

export const RecordDenialWorkInputSchema = z.object({
  workNote: z.string().min(1).max(4000),
  priority: DenialPrioritySchema.optional(),
});
export type RecordDenialWorkInput = z.infer<typeof RecordDenialWorkInputSchema>;

export const ResolveDenialInputSchema = z.object({
  resolution: z.string().min(5).max(1000),
  recoveredAmountMinor: z.number().int().nonnegative().default(0),
});
export type ResolveDenialInput = z.infer<typeof ResolveDenialInputSchema>;

export const WriteOffDenialInputSchema = z.object({
  reason: z.string().min(5).max(1000),
});
export type WriteOffDenialInput = z.infer<typeof WriteOffDenialInputSchema>;

export const AppealDenialInputSchema = z.object({
  note: z.string().min(5).max(2000),
});
export type AppealDenialInput = z.infer<typeof AppealDenialInputSchema>;

export const DenialQueueFilterSchema = z.object({
  status: z.array(DenialStatusSchema).optional(),
  assignedTo: UserIdSchema.nullable().optional(),
  priority: DenialPrioritySchema.optional(),
  claimId: ClaimIdSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type DenialQueueFilter = z.infer<typeof DenialQueueFilterSchema>;
