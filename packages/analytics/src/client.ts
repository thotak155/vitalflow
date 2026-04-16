"use client";

import posthog from "posthog-js";

import { AnalyticsEventSchema, type AnalyticsEvent } from "./events.js";

let initialized = false;

export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") {
    return;
  }
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!key) {
    return;
  }
  posthog.init(key, { api_host: host, capture_pageview: true, persistence: "localStorage" });
  initialized = true;
}

export function track(event: AnalyticsEvent): void {
  const parsed = AnalyticsEventSchema.parse(event);
  posthog.capture(parsed.name, parsed.props);
}

export function identify(userId: string, traits?: Record<string, string | number | boolean>): void {
  posthog.identify(userId, traits);
}
