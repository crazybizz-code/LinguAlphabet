import { createHmac, timingSafeEqual } from "crypto";

export const PREVIEW_COOKIE_NAME = "lingualphabet_preview_auth";
export const PREVIEW_COOKIE_MAX_AGE_SECONDS = 4 * 60 * 60; // 4 hours

/**
 * The only safe landing zone after a preview login. Any `redirect` query
 * parameter that doesn't start with this prefix is silently replaced with
 * it — this applies both to the value passed into PreviewLoginForm and to
 * the nested redirect that an unauthenticated visitor passes through the
 * main login flow.
 */
export const PREVIEW_REDIRECT_FALLBACK = "/podcast-preview/";

/**
 * Validates the `redirect` query parameter from the preview login flow.
 * Only internal paths strictly under `/podcast-preview/` are accepted.
 * Rejects absolute URLs (https://...), protocol-relative URLs (//...),
 * paths outside /podcast-preview/, empty strings, and undefined.
 *
 * NOTE: TypeScript does not enforce a server-only boundary on this module;
 * convention and the Node.js `crypto` imports (unavailable in browser
 * bundles) serve as the runtime guard until `server-only` is added to
 * the project's dependency graph.
 */
export function sanitizePreviewRedirect(value: string | undefined): string {
  if (!value) return PREVIEW_REDIRECT_FALLBACK;
  // Rejects anything that is not a relative path under /podcast-preview/:
  // "https://evil.com", "//evil.com", "/podcast/x", "/", etc.
  if (!value.startsWith("/podcast-preview/")) return PREVIEW_REDIRECT_FALLBACK;
  return value;
}

// Binds the HMAC to this exact purpose — a token from a different HMAC
// context cannot be replayed here even if the same secret is shared.
const HMAC_CONTEXT = "lingualphabet-draft-preview-v1";

/** Deterministic token derived from the secret — stored in the cookie, never the secret itself. */
export function computePreviewToken(secret: string): string {
  return createHmac("sha256", secret).update(HMAC_CONTEXT).digest("hex");
}

/**
 * Returns true iff the cookie value matches the HMAC of the current
 * PREVIEW_SECRET. Fails closed on any error or missing configuration.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function isValidPreviewCookie(cookieValue: string | undefined): boolean {
  const secret = process.env.PREVIEW_SECRET;
  if (!secret || !cookieValue) return false;
  try {
    const expected = Buffer.from(computePreviewToken(secret), "hex");
    const actual = Buffer.from(cookieValue, "hex");
    if (expected.length !== actual.length || expected.length === 0) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
