import { WriteOffDenialInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/denials/:id/write-off
 * Terminal transition. Requires billing:write_off.
 * See docs/billing-rcm.md §3.3.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write_off",
    schema: WriteOffDenialInputSchema,
    docref: "docs/billing-rcm.md §3.3",
  });
}
