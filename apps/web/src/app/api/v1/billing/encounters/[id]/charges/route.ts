import { stubReadRoute } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * GET /api/v1/billing/encounters/:id/charges
 * List all ChargeLines for the encounter with computed aggregate view.
 * See docs/billing-rcm.md §3.1.
 */
export async function GET() {
  return stubReadRoute({
    permission: "billing:read",
    docref: "docs/billing-rcm.md §3.1",
  });
}
