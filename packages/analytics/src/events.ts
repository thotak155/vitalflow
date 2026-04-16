import { z } from "zod";

/**
 * Typed analytics event catalog.
 *
 * Adding a new event MUST go through this file — both the client and server
 * trackers type-check against `AnalyticsEvent`, so drift is a compile error.
 * Never send PHI; event payloads are product telemetry only.
 */
export const AnalyticsEventSchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("auth.signed_in"),
    props: z.object({ method: z.enum(["password", "magic_link", "sso"]) }),
  }),
  z.object({
    name: z.literal("encounter.opened"),
    props: z.object({ encounterId: z.string().uuid() }),
  }),
  z.object({
    name: z.literal("encounter.signed"),
    props: z.object({ encounterId: z.string().uuid(), timeToSignSec: z.number().nonnegative() }),
  }),
  z.object({
    name: z.literal("ai.completion_requested"),
    props: z.object({ model: z.string(), surface: z.string() }),
  }),
  z.object({
    name: z.literal("billing.invoice_sent"),
    props: z.object({ invoiceId: z.string().uuid() }),
  }),
]);

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type AnalyticsEventName = AnalyticsEvent["name"];
