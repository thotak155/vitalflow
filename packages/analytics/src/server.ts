import { PostHog } from "posthog-node";

import { AnalyticsEventSchema, type AnalyticsEvent } from "./events.js";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) {
    return client;
  }
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!key) {
    return null;
  }
  client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
  return client;
}

export async function trackServer(
  distinctId: string,
  event: AnalyticsEvent,
  tenantId?: string,
): Promise<void> {
  const parsed = AnalyticsEventSchema.parse(event);
  const ph = getClient();
  if (!ph) {
    return;
  }
  ph.capture({
    distinctId,
    event: parsed.name,
    properties: { ...parsed.props, tenantId },
  });
  await ph.flush();
}
