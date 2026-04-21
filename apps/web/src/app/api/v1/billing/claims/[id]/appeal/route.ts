import { AppealClaimInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/claims/:id/appeal
 * Transition to appealed. Records reason + optional supporting-doc references.
 * See docs/billing-rcm.md §3.2.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: AppealClaimInputSchema,
    docref: "docs/billing-rcm.md §3.2",
  });
}
