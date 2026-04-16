import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase magic-link / OAuth callback. The magic-link email redirects here
 * with a `code` query param; we exchange it for a session cookie, then bounce
 * to the requested destination.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createVitalFlowServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

/** Only allow relative paths — prevents open-redirect via `?next=https://evil`. */
function safeNext(raw: string | null): string {
  if (!raw) {
    return "/";
  }
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/";
}
