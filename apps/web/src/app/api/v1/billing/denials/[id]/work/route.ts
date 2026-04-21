import { RecordDenialWorkInputSchema } from "@vitalflow/types";
import { type NextRequest } from "next/server";

import { stubRouteWithBody } from "../../../../../../../lib/billing-route-helpers.js";

/**
 * POST /api/v1/billing/denials/:id/work
 * Append a work-note. Transitions open → working on first note.
 * See docs/billing-rcm.md §3.3.
 */
export async function POST(req: NextRequest) {
  return stubRouteWithBody(req, {
    permission: "billing:write",
    schema: RecordDenialWorkInputSchema,
    docref: "docs/billing-rcm.md §3.3",
  });
}
