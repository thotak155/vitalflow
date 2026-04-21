import { stubReadRoute } from "../../../../../../lib/billing-route-helpers.js";

/**
 * GET /api/v1/billing/claims/:id
 * Returns the claim, its lines, and the status history timeline.
 * See docs/billing-rcm.md §3.2.
 */
export async function GET() {
  return stubReadRoute({
    permission: "billing:read",
    docref: "docs/billing-rcm.md §3.2",
  });
}
