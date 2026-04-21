import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "../../../../../../../../lib/session.js";

/**
 * POST /api/v1/ai/scribe/sessions/:id/cancel
 * Cancel an active scribe session. Best-effort abandons any running step.
 * See docs/ai-scribe.md §3.1.
 */
export async function POST(
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
    { error: "not_implemented", message: "Cancel ships with the pipeline impl." },
    { status: 501 },
  );
}
