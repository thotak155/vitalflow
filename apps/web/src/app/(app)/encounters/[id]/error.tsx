"use client";

import { ErrorFallback } from "../../../../components/error-fallback.js";

export default function EncounterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      scope="Encounter"
      error={error}
      reset={reset}
      hint="Couldn't load this encounter. The workspace will retry when you click Retry."
      fallbackHref="/encounters"
      fallbackLabel="Back to encounters list"
    />
  );
}
