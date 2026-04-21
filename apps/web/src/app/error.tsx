"use client";

import { ErrorFallback } from "../components/error-fallback.js";

/**
 * Top-level error boundary. Catches anything that escapes a nested
 * `error.tsx`. Kept intentionally plain so it can't itself throw.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      hint="An unexpected error occurred. Our team has been notified by the server logs. Retry the action, or go back to the dashboard."
      fallbackHref="/"
      fallbackLabel="Back to dashboard"
    />
  );
}
