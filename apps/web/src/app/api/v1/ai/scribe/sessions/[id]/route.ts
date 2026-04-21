import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "../../../../../../../lib/session.js";

/**
 * GET /api/v1/ai/scribe/sessions/:id
 * Polling endpoint — returns SessionView (status, steps, draft, codes, transcript).
 * See docs/ai-scribe.md §4.3.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!session.permissions.includes("ai:invoke")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "Session view wiring lands with the ScribeSessionService impl. See docs/ai-scribe.md §4.3.",
    },
    { status: 501 },
  );
}
