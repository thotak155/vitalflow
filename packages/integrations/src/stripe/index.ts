import Stripe from "stripe";

let singleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (singleton) {
    return singleton;
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is required");
  }
  singleton = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  return singleton;
}
