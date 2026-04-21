import { stubReadRoute } from "../../../../../../lib/billing-route-helpers.js";

/**
 * GET /api/v1/billing/denials/:id
 * See docs/billing-rcm.md §3.3.
 */
export async function GET() {
  return stubReadRoute({
    permission: "billing:read",
    docref: "docs/billing-rcm.md §3.3",
  });
}
