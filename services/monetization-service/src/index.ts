import { getStripe } from "@vitalflow/integrations/stripe";
import type { TenantId } from "@vitalflow/types";

export type Plan = "starter" | "growth" | "enterprise";

export interface MeteredUsage {
  tenantId: TenantId;
  meter: "ai.completions" | "encounters" | "seats" | "storage_gb";
  quantity: number;
  occurredAt: string;
}

export async function reportUsage(usage: MeteredUsage): Promise<void> {
  const stripe = getStripe();
  const subscriptionItemId = process.env[`STRIPE_SUBSCRIPTION_ITEM_${usage.meter.toUpperCase()}`];
  if (!subscriptionItemId) {
    return;
  }
  await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
    quantity: usage.quantity,
    timestamp: Math.floor(new Date(usage.occurredAt).getTime() / 1000),
    action: "increment",
  });
}
