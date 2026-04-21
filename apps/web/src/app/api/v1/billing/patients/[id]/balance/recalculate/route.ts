import { stubMutationNoBody } from "../../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/patients/:id/balance/recalculate
 * Full recompute from invoices + unposted payments. Admin tool; used to
 * reconcile after a migration or an external data import.
 * See docs/billing-rcm.md §3.5.
 */
export async function POST() {
  return stubMutationNoBody({
    permission: "billing:write",
    docref: "docs/billing-rcm.md §3.5",
  });
}
