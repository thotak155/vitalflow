import { z } from "zod";

import { TenantIdSchema } from "../tenancy/index.js";

export const InvoiceIdSchema = z.string().uuid().brand<"InvoiceId">();
export type InvoiceId = z.infer<typeof InvoiceIdSchema>;

export const MoneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});
export type Money = z.infer<typeof MoneySchema>;

export const InvoiceStatusSchema = z.enum([
  "draft",
  "issued",
  "paid",
  "partial",
  "void",
  "written_off",
]);

export const InvoiceSchema = z.object({
  id: InvoiceIdSchema,
  tenantId: TenantIdSchema,
  number: z.string(),
  status: InvoiceStatusSchema,
  total: MoneySchema,
  balance: MoneySchema,
  issuedAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;
