import { CreateScribeSessionInputSchema } from "@vitalflow/types";
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "../../../../../../lib/session.js";

/**
 * POST /api/v1/ai/scribe/sessions
 * Creates a scribe session for an encounter.
 *
 * Stub: validates the shape and permission; returns 501 until the
 * ScribeSessionService implementation lands. See docs/ai-scribe.md §4.1.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!session.permissions.includes("ai:invoke")) {
    return NextResponse.json({ error: "forbidden", reason: "missing ai:invoke" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateScribeSessionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "AI scribe pipeline implementation ships in the next PR. See docs/ai-scribe.md §11 rollout.",
    },
    { status: 501 },
  );
}
