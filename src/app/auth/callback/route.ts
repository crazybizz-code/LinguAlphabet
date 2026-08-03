import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeAuthRedirect } from "@/lib/auth/redirect";

/**
 * OAuth callback handler — the landing point after Supabase redirects the
 * browser back from Google (or any future OAuth provider).
 *
 * Critical invariants:
 *   - Onboarding cannot be bypassed by any `next` value.
 *   - `next` is always sanitized before use.
 *   - Error redirects never expose provider tokens, codes, or internal details.
 *   - All outbound redirects are same-origin.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  const loginError = new URL("/login?error=oauth_failed", origin);

  if (!code) {
    return NextResponse.redirect(loginError);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(loginError);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(loginError);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .single();

  // Onboarding is always the first gate — no `next` redirect can skip it.
  if (!profile?.onboarding_completed) {
    return NextResponse.redirect(new URL("/welcome", origin));
  }

  const destination = sanitizeAuthRedirect(rawNext);
  return NextResponse.redirect(new URL(destination, origin));
}
