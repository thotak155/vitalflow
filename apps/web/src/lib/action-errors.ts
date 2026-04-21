import { toBannerMessage, VitalFlowError } from "@vitalflow/shared-utils/errors";
import { redirect } from "next/navigation";

/**
 * Redirect-after-action helpers used by every Server Action in the app.
 *
 * Pattern:
 *
 *   try {
 *     await service.doThing(ctx, input);
 *   } catch (err) {
 *     redirectWithError(`/billing/claims/${id}`, err);
 *   }
 *   redirectWithOk(`/billing/claims/${id}`, "Marked ready");
 *
 * Catches `VitalFlowError` (from services) and non-structured errors
 * (DB / network) equally — `toBannerMessage` picks the most useful
 * human-readable line available. Never leaks stack traces to the URL.
 */

function appendQuery(url: string, key: "ok" | "error", value: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

export function redirectWithOk(url: string, message: string): never {
  redirect(appendQuery(url, "ok", message));
}

export function redirectWithError(url: string, err: unknown): never {
  redirect(appendQuery(url, "error", toBannerMessage(err)));
}

/**
 * Safe wrapper for one-liner action bodies that don't need intermediate
 * state before the redirect. Example:
 *
 *   return runAction(() => service.markReady(session, id), {
 *     ok: () => redirectWithOk(`/billing/claims/${id}`, "Marked ready"),
 *     onError: (err) => redirectWithError(`/billing/claims/${id}`, err),
 *   });
 *
 * Returns `never` because every branch ends in a `redirect()`.
 */
export async function runAction<T>(
  work: () => Promise<T>,
  opts: {
    ok: (result: T) => never;
    onError: (err: unknown) => never;
  },
): Promise<never> {
  let result: T;
  try {
    result = await work();
  } catch (err) {
    opts.onError(err);
  }
  opts.ok(result);
}

// Re-export so action files only need this one import for error adapting.
export { VitalFlowError };
