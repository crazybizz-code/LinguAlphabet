import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Server-side Supabase client — use this in Server Components, Route
 * Handlers, and Server Actions. Wrapped in `React.cache()` so every call
 * within the same request (e.g. both `(app)/layout.tsx` and the page it's
 * wrapping) shares one instance instead of each constructing its own —
 * still effectively "fresh per request," since `cache()`'s memoization is
 * itself scoped to a single request/render pass in the App Router (a
 * Route Handler or Server Action is its own separate request, so it gets
 * its own fresh cache scope, never a stale client from a previous one).
 * This sharing is what lets `getAuthenticatedUser()` and
 * `getCachedLearnerProfile()` below actually dedupe: their own `cache()`
 * wrappers key on this client's identity, which only stays stable across
 * a request if `createClient()` itself does too.
 *
 * The try/catch around cookieStore.set is intentional, not defensive
 * clutter: Server Components can't set cookies (Next.js throws), which
 * is fine as long as `middleware.ts` is refreshing the session on every
 * request — this only matters for Server Actions/Route Handlers, where
 * it's not thrown.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore, see
            // the doc comment above.
          }
        },
      },
    },
  );
});

/**
 * `supabase.auth.getUser()` always makes a real network round-trip to
 * Supabase Auth to revalidate the JWT (deliberately, unlike `getSession()`,
 * for security) — every previous call site called it directly, so a route
 * like `/tuto`, where both `(app)/layout.tsx` (for the sidebar) and the
 * page itself each need "who's signed in," paid for that round trip
 * twice on every single load. Caching the result, not just the client,
 * collapses that to once per request.
 */
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
