"use client";

import { ErrorFallback } from "../../../components/error-fallback.js";

export default function BillingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      scope="Billing"
      error={error}
      reset={reset}
      hint="Couldn't load billing data. Try again, or return to the overview."
      fallbackHref="/billing"
      fallbackLabel="Back to Overview"
    />
  );
}
