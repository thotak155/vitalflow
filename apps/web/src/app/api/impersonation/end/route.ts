import { endImpersonation, getActiveImpersonation } from "@vitalflow/auth/impersonation";
import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Endpoint hit by the ImpersonationBanner's "End session" form. Revokes the
 * current active impersonation for the authenticated user and redirects back
 * to the referrer.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createVitalFlowServerClient();
  const active = await getActiveImpersonation(supabase);
  if (active) {
    await endImpersonation(supabase, active.sessionId, "Ended via in-app banner");
  }
  const origin = new URL(request.url).origin;
  const referer = request.headers.get("referer");
  const dest = referer && referer.startsWith(origin) ? referer : `${origin}/`;
  return NextResponse.redirect(dest, { status: 303 });
}
