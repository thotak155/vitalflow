import { ApplyRemittanceInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/claims/:id/remittance
 * Apply an 835 remittance. Transitions to paid | partial | denied; creates
 * Denial rows for lines with zero allowed_minor.
 * See docs/billing-rcm.md §3.2.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: ApplyRemittanceInputSchema,
    docref: "docs/billing-rcm.md §3.2",
  });
}
