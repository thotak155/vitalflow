import { CreateChargeLineInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/charges
 * Create a new charge line (status=draft).
 * See docs/billing-rcm.md §3.1.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: CreateChargeLineInputSchema,
    docref: "docs/billing-rcm.md §3.1",
  });
}
