import { stubMutationNoBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/claims/:id/ready
 * draft → ready. Validates completeness.
 * See docs/billing-rcm.md §3.2.
 */
export async function POST() {
  return stubMutationNoBody({
    permission: "billing:write",
    docref: "docs/billing-rcm.md §3.2",
  });
}
