import { stubReadRoute } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * GET /api/v1/billing/patients/:id/balance
 * Returns the cached PatientBalance. Zero-filled when the patient has no
 * billing activity yet.
 * See docs/billing-rcm.md §3.5.
 */
export async function GET() {
  return stubReadRoute({
    permission: "billing:read",
    docref: "docs/billing-rcm.md §3.5",
  });
}
