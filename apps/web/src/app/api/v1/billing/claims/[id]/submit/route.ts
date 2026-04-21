import { stubMutationNoBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/claims/:id/submit
 * ready → submitted. Calls ClearinghouseSubmitter.submit837.
 * V1 stub returns 501 because no clearinghouse is wired yet.
 * See docs/billing-rcm.md §3.2 + §4.3.
 */
export async function POST() {
  return stubMutationNoBody({
    permission: "billing:write",
    docref: "docs/billing-rcm.md §3.2",
  });
}
