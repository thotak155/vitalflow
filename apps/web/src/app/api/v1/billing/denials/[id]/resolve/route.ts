import { ResolveDenialInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/denials/:id/resolve
 * Terminal transition. Records resolution + recovered amount (partial recovery allowed).
 * See docs/billing-rcm.md §3.3.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: ResolveDenialInputSchema,
    docref: "docs/billing-rcm.md §3.3",
  });
}
