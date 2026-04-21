import { RecordPaymentInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubReadRoute, stubRouteWithBody } from "../../../../../lib/billing-route-helpers.js";

/**
 * GET /api/v1/billing/payments
 * List payments by patient / invoice / date range / method.
 * See docs/billing-rcm.md §3.4.
 */
export async function GET() {
  return stubReadRoute({
    permission: "billing:read",
    docref: "docs/billing-rcm.md §3.4",
  });
}

/**
 * POST /api/v1/billing/payments
 * Record a patient or insurance payment. Updates invoice.balance_minor and
 * patient_balances in the same transaction.
 * Requires billing:collect (patient payments) or billing:write (insurance posts).
 * See docs/billing-rcm.md §3.4.
 */
export async function POST(req: NextRequest) {
  // The distinction between collect vs write is enforced in the service layer
  // because it depends on the `method` field; at this scaffold layer we
  // require the narrower billing:collect which both roles of interest carry.
  return stubRouteWithBody(req, {
    permission: "billing:collect",
    schema: RecordPaymentInputSchema,
    docref: "docs/billing-rcm.md §3.4",
  });
}
