import type { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";

import { getSession, type AppSession } from "./session.js";

/**
 * Shared stub helpers for `/api/v1/billing/**`. All billing route handlers
 * return 501 in this slice; these helpers keep the auth + validation
 * plumbing consistent and the per-route files small.
 *
 * Pattern:
 *
 *   export async function POST(req: NextRequest) {
 *     return stubRouteWithBody(req, {
 *       permission: "billing:write",
 *       schema: CreateChargeLineInputSchema,
 *       docref: "docs/billing-rcm.md §3.1",
 *     });
 *   }
 *
 * When the service implementation lands, swap the `return stub...` for the
 * real handler; auth + Zod stay the same by copying those lines in.
 */

export type BillingPermission =
  | "billing:read"
  | "billing:write"
  | "billing:collect"
  | "billing:adjust"
  | "billing:write_off";

export async function requireBillingSession(
  permission: BillingPermission,
): Promise<{ session: AppSession } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  if (!session.permissions.includes(permission)) {
    return {
      error: NextResponse.json(
        { error: "forbidden", reason: `missing ${permission}` },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function stubRouteWithBody<S extends z.ZodTypeAny>(
  req: NextRequest,
  opts: {
    permission: BillingPermission;
    schema: S;
    docref: string;
  },
): Promise<NextResponse> {
  const gated = await requireBillingSession(opts.permission);
  if ("error" in gated) return gated.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = opts.schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  return NextResponse.json(
    {
      error: "not_implemented",
      message: `Service implementation ships in the next billing slice. See ${opts.docref}.`,
    },
    { status: 501 },
  );
}

export async function stubReadRoute(opts: {
  permission: BillingPermission;
  docref: string;
}): Promise<NextResponse> {
  const gated = await requireBillingSession(opts.permission);
  if ("error" in gated) return gated.error;
  return NextResponse.json(
    {
      error: "not_implemented",
      message: `Service implementation ships in the next billing slice. See ${opts.docref}.`,
    },
    { status: 501 },
  );
}

export async function stubMutationNoBody(opts: {
  permission: BillingPermission;
  docref: string;
}): Promise<NextResponse> {
  const gated = await requireBillingSession(opts.permission);
  if ("error" in gated) return gated.error;
  return NextResponse.json(
    {
      error: "not_implemented",
      message: `Service implementation ships in the next billing slice. See ${opts.docref}.`,
    },
    { status: 501 },
  );
}
