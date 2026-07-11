import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Service-role Supabase client — ops/backend code only (the Content
 * Engine's pipeline, future admin scripts), never request/session-bound
 * like lib/supabase/client.ts (browser) or server.ts (SSR, cookie-bound).
 * An ingestion run has no logged-in user, and needs to bypass RLS to
 * write content_items/content_raw_items/etc., which is exactly what the
 * service role key is for — same posture scripts/publish-remote-lesson.mjs
 * already uses via raw REST calls.
 *
 * SUPABASE_SERVICE_ROLE_KEY is read directly here, NOT via lib/env.ts —
 * that module's exports get inlined into the browser bundle too (it's
 * used by client.ts). Routing a service-role secret through it would leak
 * it to every page. This file must never be imported from a Client
 * Component or from anything lib/env.ts-adjacent.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check .env against .env.example.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
