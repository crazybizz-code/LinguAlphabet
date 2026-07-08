import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Browser-side Supabase client — use this in Client Components
 * ("use client"). Safe to call repeatedly; @supabase/ssr manages a
 * single underlying client and syncs auth state via cookies so the
 * server can read the same session (see lib/supabase/server.ts).
 */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
