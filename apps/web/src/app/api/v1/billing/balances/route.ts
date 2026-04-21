import { stubReadRoute } from "../../../../../lib/billing-route-helpers.js";

/**
 * GET /api/v1/billing/balances
 * Dashboard-wide list. Defaults to patients with outstanding balances
 * sorted by over-90 aging bucket descending.
 * See docs/billing-rcm.md §3.5.
 */
export async function GET() {
  return stubReadRoute({
    permission: "billing:read",
    docref: "docs/billing-rcm.md §3.5",
  });
}
