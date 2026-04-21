import { CloseClaimInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/claims/:id/close
 * Terminal transition. Requires a reason.
 * See docs/billing-rcm.md §3.2.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: CloseClaimInputSchema,
    docref: "docs/billing-rcm.md §3.2",
  });
}
