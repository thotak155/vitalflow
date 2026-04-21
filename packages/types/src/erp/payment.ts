import { z } from "zod";

import { PatientIdSchema } from "../clinical/index.js";
import { TenantIdSchema } from "../tenancy/index.js";
import { InvoiceIdSchema } from "./index.js";
import { PayerIdSchema } from "./claim.js";

// ---------- IDs --------------------------------------------------------------

export const PaymentIdSchema = z.string().uuid().brand<"PaymentId">();
export type PaymentId = z.infer<typeof PaymentIdSchema>;

// ---------- Enums ------------------------------------------------------------

export const PaymentMethodSchema = z.enum([
  "cash",
  "check",
  "card",
  "ach",
  "insurance",
  "credit_adjust",
  "write_off",
  "other",
]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// ---------- Schema -----------------------------------------------------------

export const PaymentSchema = z.object({
  id: PaymentIdSchema,
  tenantId: TenantIdSchema,
  invoiceId: InvoiceIdSchema.nullable().optional(),
  patientId: PatientIdSchema.nullable().optional(),
  payerId: PayerIdSchema.nullable().optional(),
  method: PaymentMethodSchema,
  amountMinor: z.number().int(),
  currency: z.string().length(3).default("USD"),
  receivedAt: z.string().datetime(),
  reference: z.string().max(128).nullable().optional(),
  processor: z.string().max(64).nullable().optional(),
  processorRef: z.string().max(128).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  createdAt: z.string().datetime(),
});
export type Payment = z.infer<typeof PaymentSchema>;

// ---------- Inputs -----------------------------------------------------------

const paymentBase = z.object({
  invoiceId: InvoiceIdSchema.nullable().optional(),
  patientId: PatientIdSchema.nullable().optional(),
  payerId: PayerIdSchema.nullable().optional(),
  method: PaymentMethodSchema,
  amountMinor: z
    .number()
    .int()
    .refine((v) => v !== 0, { message: "amount must be non-zero" }),
  currency: z.string().length(3).default("USD"),
  receivedAt: z.string().datetime(),
  reference: z.string().max(128).optional(),
  processor: z.string().max(64).optional(),
  processorRef: z.string().max(128).optional(),
  notes: z.string().max(2000).optional(),
});

export const RecordPaymentInputSchema = paymentBase.superRefine((v, ctx) => {
  // Exactly one of patientId / payerId must be set.
  const hasPatient = !!v.patientId;
  const hasPayer = !!v.payerId;
  if (hasPatient === hasPayer) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["patientId"],
      message: "Exactly one of patientId or payerId is required",
    });
  }
  if (v.method === "insurance" && !hasPayer) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["method"],
      message: "method=insurance requires payerId",
    });
  }
  if (["cash", "check", "card", "ach"].includes(v.method) && !hasPatient) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["method"],
      message: `method=${v.method} requires patientId`,
    });
  }
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentInputSchema>;

export const RefundPaymentInputSchema = z.object({
  amountMinor: z
    .number()
    .int()
    .positive()
    .describe("Absolute refund amount; sign flipped on insert"),
  reason: z.string().min(5).max(500),
});
export type RefundPaymentInput = z.infer<typeof RefundPaymentInputSchema>;

export const PaymentListFilterSchema = z.object({
  patientId: PatientIdSchema.optional(),
  invoiceId: InvoiceIdSchema.optional(),
  payerId: PayerIdSchema.optional(),
  method: PaymentMethodSchema.optional(),
  receivedAfter: z.string().datetime().optional(),
  receivedBefore: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type PaymentListFilter = z.infer<typeof PaymentListFilterSchema>;
