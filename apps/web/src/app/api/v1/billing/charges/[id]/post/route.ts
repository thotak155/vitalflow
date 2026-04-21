import { stubMutationNoBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/charges/:id/post
 * Transition draft → posted. Requires at least one ICD-10 code on the line.
 * See docs/billing-rcm.md §3.1.
 */
export async function POST() {
  return stubMutationNoBody({
    permission: "billing:write",
    docref: "docs/billing-rcm.md §3.1",
  });
}
