import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Server-side Supabase client — use this in Server Components, Route
 * Handlers, and Server Actions. Must be created fresh per request
 * (never module-level singleton) since it's bound to that request's
 * cookies.
 *
 * The try/catch around cookieStore.set is intentional, not defensive
 * clutter: Server Components can't set cookies (Next.js throws), which
 * is fine as long as `middleware.ts` is refreshing the session on every
 * request — this only matters for Server Actions/Route Handlers, where
 * it's not thrown.
 */
export async function createClient() {
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
}
