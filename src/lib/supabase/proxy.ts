import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request that isn't a
 * static asset (see the matcher in middleware.ts). Required with
 * @supabase/ssr's cookie-based flow — without this, sessions expire
 * silently in Server Components since only middleware can write
 * refreshed cookies back to the request/response pair.
 *
 * Do not add data-fetching or business logic here — this must stay a
 * thin, fast pass on every request.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not remove: this triggers the token refresh. Reading `user` (not
  // `session`) is deliberate — it revalidates against the Supabase Auth
  // server instead of trusting a potentially-stale local session.
  await supabase.auth.getUser();

  return supabaseResponse;
}
