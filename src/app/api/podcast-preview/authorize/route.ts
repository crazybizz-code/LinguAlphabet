import { type NextRequest, NextResponse } from "next/server";
import { computePreviewToken, PREVIEW_COOKIE_NAME, PREVIEW_COOKIE_MAX_AGE_SECONDS } from "@/lib/preview/auth";

/**
 * POST /api/podcast-preview/authorize
 *
 * Validates the operator's PREVIEW_SECRET from the request body (never a
 * URL parameter — a long-lived secret must not appear in browser history,
 * referrer headers, or server logs) and exchanges it for an HttpOnly cookie.
 * The cookie stores an HMAC of the secret, never the secret itself.
 *
 * Two-guard model: this endpoint checks the operator credential only.
 * The preview page itself additionally requires a valid LinguABC session,
 * so a stolen cookie is useless without also being authenticated.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const submitted =
    typeof body === "object" &&
    body !== null &&
    "secret" in body &&
    typeof (body as Record<string, unknown>).secret === "string"
      ? ((body as Record<string, unknown>).secret as string)
      : null;

  const envSecret = process.env.PREVIEW_SECRET;

  // Fail closed: missing config = nobody gets in.
  if (!envSecret || !submitted || submitted !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = computePreviewToken(envSecret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PREVIEW_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    // Scoped to the preview path — never sent to the main app or API.
    path: "/podcast-preview",
    maxAge: PREVIEW_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
