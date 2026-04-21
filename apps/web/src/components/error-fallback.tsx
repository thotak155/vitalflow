"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@vitalflow/ui";
import { AlertCircle } from "@vitalflow/ui/icons";
import NextLink from "next/link";
import { useEffect } from "react";

/**
 * Branded error boundary used by every `error.tsx` in the app. Client
 * component (required by Next.js App Router: error.tsx always runs on the
 * client).
 *
 * Contract:
 *   - Never show a stack trace.
 *   - Message comes from `error.message` — services produce readable
 *     messages via `VitalFlowError`.
 *   - Retry button calls `reset()` which re-renders the route segment.
 *   - Digest (from the server log) is shown small so support can correlate.
 *
 * Keep this component narrow. Don't add anything that could itself throw —
 * it is already running inside an error boundary.
 */

export interface ErrorFallbackProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
  /** Breadcrumb-style title — "Billing" / "Encounter" / etc. */
  readonly scope?: string;
  /** Extra copy below the error — e.g. "Billing data failed to load." */
  readonly hint?: string;
  /** A link to fall back to when retry doesn't help. */
  readonly fallbackHref?: string;
  readonly fallbackLabel?: string;
}

export function ErrorFallback({
  error,
  reset,
  scope,
  hint,
  fallbackHref,
  fallbackLabel,
}: ErrorFallbackProps) {
  // Side-effect: log once for server observability (Next.js also logs on
  // the server when an RSC throws, but we reinforce on the client too so
  // browser devtools show the digest).
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[error-boundary]", {
      scope: scope ?? "app",
      message: error.message,
      digest: error.digest ?? null,
    });
  }, [error, scope]);

  const message = error.message?.trim() || "Something went wrong";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-5 w-5 text-red-600" aria-hidden />
            {scope ? `${scope} — something went wrong` : "Something went wrong"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-800">{message}</p>
          {hint ? <p className="text-xs text-slate-600">{hint}</p> : null}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button type="button" variant="default" size="sm" onClick={reset}>
              Retry
            </Button>
            {fallbackHref ? (
              <NextLink
                href={fallbackHref}
                className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                {fallbackLabel ?? "Go back"}
              </NextLink>
            ) : null}
          </div>

          {error.digest ? (
            <p className="pt-2 font-mono text-[11px] text-slate-500">
              ref: <span className="select-all">{error.digest}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
