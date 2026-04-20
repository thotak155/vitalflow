import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase email callback. Handles three link types:
 *   - invite   → exchange code, route to /set-password (first-time users set their password)
 *   - recovery → exchange code, route to /reset-password (password reset flow)
 *   - magiclink / signup / unspecified → exchange code, route to `next` (default "/")
 *
 * The email templates should pass `type` explicitly; we fall back to "next" routing
 * if it's absent so existing magic-link emails still resolve.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
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

  if (type === "invite") {
    return NextResponse.redirect(new URL("/set-password", url.origin));
  }
  if (type === "recovery") {
    return NextResponse.redirect(new URL("/reset-password", url.origin));
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
