import { VoidChargeInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/charges/:id/void
 * Transition to voided. Refuses if line is on a submitted claim.
 * See docs/billing-rcm.md §3.1.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:adjust",
    schema: VoidChargeInputSchema,
    docref: "docs/billing-rcm.md §3.1",
  });
}
