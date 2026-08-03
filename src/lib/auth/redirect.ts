/**
 * The safe fallback destination — always a valid post-auth landing for
 * an authenticated, onboarded user.
 */
export const AUTH_REDIRECT_FALLBACK = "/dashboard";

/**
 * Accepts only same-app relative paths (beginning with exactly one "/").
 * Every other value falls back to AUTH_REDIRECT_FALLBACK.
 *
 * Rejects:
 *   - absolute URLs ("https://evil.com")
 *   - protocol-relative URLs ("//evil.com")
 *   - URI-scheme paths ("/javascript:", "/data:", "/vbscript:")
 *   - non-string / empty input
 *
 * Preserves valid query strings on accepted relative paths.
 */
export function sanitizeAuthRedirect(value: unknown): string {
  if (typeof value !== "string" || !value) return AUTH_REDIRECT_FALLBACK;
  const trimmed = value.trim();
  // Must begin with "/" but not "//" (protocol-relative)
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return AUTH_REDIRECT_FALLBACK;
  // Reject paths whose first segment embeds a URI scheme: /javascript:, /data:, /vbscript:
  // (per RFC 3986 §4.2, a relative-ref whose first segment contains ":" is ambiguous)
  if (/^\/[a-z][a-z\d+\-.]*:/i.test(trimmed)) return AUTH_REDIRECT_FALLBACK;
  return trimmed;
}

/**
 * Determines where to send a user after a successful email/password login.
 * Onboarding is always the first gate — no redirectTo value can skip it.
 */
export function choosePostLoginDestination(
  onboardingCompleted: boolean,
  redirectTo?: string,
): string {
  if (!onboardingCompleted) return "/welcome";
  return sanitizeAuthRedirect(redirectTo);
}

/**
 * Builds the OAuth callback URL for Google sign-in. Always same-origin
 * /auth/callback. When `next` is provided it is sanitized before being
 * appended, so the callback route receives a safe destination parameter.
 */
export function buildGoogleCallbackUrl(origin: string, next?: string): string {
  const url = new URL("/auth/callback", origin);
  if (next !== undefined) {
    url.searchParams.set("next", sanitizeAuthRedirect(next));
  }
  return url.toString();
}
