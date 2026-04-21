import { AssignDenialInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/denials/:id/assign
 * Assign denial to a biller. Target user must carry billing:write.
 * See docs/billing-rcm.md §3.3.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: AssignDenialInputSchema,
    docref: "docs/billing-rcm.md §3.3",
  });
}
