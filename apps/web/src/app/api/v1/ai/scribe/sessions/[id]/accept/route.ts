import { AcceptDraftInputSchema } from "@vitalflow/types";
import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "../../../../../../../../lib/session.js";

/**
 * POST /api/v1/ai/scribe/sessions/:id/accept
 * Accept the AI draft into encounter_notes as status='draft'. Never signs.
 * Blocks while impersonating. See docs/ai-scribe.md §4.6 + §5.1 + §5.4.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!session.permissions.includes("ai:invoke")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (session.impersonation) {
    return NextResponse.json(
      { error: "forbidden", reason: "accept refused while impersonating" },
      { status: 403 },
    );
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = AcceptDraftInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  return NextResponse.json(
    {
      error: "not_implemented",
      message: "Accept-into-note wiring ships with the pipeline impl. See docs/ai-scribe.md §4.6.",
    },
    { status: 501 },
  );
}
