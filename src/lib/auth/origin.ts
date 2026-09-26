/**
 * Canonical production origin (pentest V-04).
 *
 * Supabase Auth sends confirmation/recovery/OAuth redirects only to its
 * configured Site URL and allow-listed Redirect URLs, and every auth call in
 * this app builds its redirect from `window.location.origin`. So the origin a
 * learner starts an auth flow on is the origin their tokens come back to.
 * Keeping learners on one canonical origin is what makes the dashboard's
 * allow-list meaningful.
 */
export const CANONICAL_APP_ORIGIN = "https://app.linguabc.xyz";

/** Former production hosts that must no longer start auth flows. */
export const LEGACY_APP_HOSTS: readonly string[] = ["lingu-alphabet.vercel.app"];

/**
 * Where a request that arrived on a legacy host should go instead, or null
 * to serve it as-is.
 *
 * Deliberately narrow:
 *   - only GET/HEAD page navigations are moved (a redirected POST would
 *     fail Server Actions' same-origin check anyway);
 *   - `/api/*` is left alone so cron jobs and webhooks keep working
 *     wherever they are pointed;
 *   - `/auth/callback` is left alone so a flow already in flight when this
 *     ships can finish — its PKCE verifier cookie lives on the legacy
 *     origin and would be lost across a redirect.
 */
export function legacyHostRedirect(url: URL, method: string): URL | null {
  if (!LEGACY_APP_HOSTS.includes(url.hostname)) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  if (url.pathname === "/auth/callback") return null;
  // Assign path/query onto a canonical URL rather than resolving a string
  // against it: resolving "//evil.example/x" would yield evil.example.
  const target = new URL(CANONICAL_APP_ORIGIN);
  target.pathname = url.pathname;
  target.search = url.search;
  return target;
}
