import { UpdateChargeLineInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../lib/billing-route-helpers.js";

/**
 * PATCH /api/v1/billing/charges/:id
 * Update a draft charge line. Refuses if the line has left draft.
 * See docs/billing-rcm.md §3.1.
 */
export async function PATCH(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: UpdateChargeLineInputSchema,
    docref: "docs/billing-rcm.md §3.1",
  });
}
