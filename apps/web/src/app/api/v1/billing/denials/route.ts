import { CreateDenialInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubReadRoute, stubRouteWithBody } from "../../../../../lib/billing-route-helpers.js";

/**
 * GET /api/v1/billing/denials
 * Queue view. Default filter = status in (open, working), oldest-first
 * within priority.
 * See docs/billing-rcm.md §3.3.
 */
export async function GET() {
  return stubReadRoute({
    permission: "billing:read",
    docref: "docs/billing-rcm.md §3.3",
  });
}

/**
 * POST /api/v1/billing/denials
 * Create a denial row. Typically called internally from applyRemittance —
 * exposed here for manual entry when a payer portal surfaces a denial
 * outside the 835 flow.
 * See docs/billing-rcm.md §3.3.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: CreateDenialInputSchema,
    docref: "docs/billing-rcm.md §3.3",
  });
}
