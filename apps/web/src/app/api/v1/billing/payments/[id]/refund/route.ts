import { RefundPaymentInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/payments/:id/refund
 * Creates a second payment row with sign-flipped amount. Never mutates the
 * original. Refund > original amount is refused.
 * See docs/billing-rcm.md §3.4.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:adjust",
    schema: RefundPaymentInputSchema,
    docref: "docs/billing-rcm.md §3.4",
  });
}
