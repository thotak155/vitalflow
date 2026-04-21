import { AppealDenialInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/denials/:id/appeal
 * Transition to appealed. Touches parent claim's status history.
 * See docs/billing-rcm.md §3.3.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: AppealDenialInputSchema,
    docref: "docs/billing-rcm.md §3.3",
  });
}
