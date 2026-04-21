import { CreateClaimFromChargesInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubReadRoute, stubRouteWithBody } from "../../../../../lib/billing-route-helpers.js";

/**
 * GET /api/v1/billing/claims
 * List claims with status / date / payer filters and pagination.
 * See docs/billing-rcm.md §3.2.
 */
export async function GET() {
  return stubReadRoute({
    permission: "billing:read",
    docref: "docs/billing-rcm.md §3.2",
  });
}

/**
 * POST /api/v1/billing/claims
 * Create a claim + lines from posted charges.
 * See docs/billing-rcm.md §3.2.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: CreateClaimFromChargesInputSchema,
    docref: "docs/billing-rcm.md §3.2",
  });
}
