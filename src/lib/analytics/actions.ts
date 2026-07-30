"use server";

import { createServiceClient } from "@/lib/supabase/service-client";
import { recordEvent } from "./record";

/**
 * signup_completed's one special case: fired the instant auth.signUp()
 * returns a real user id, which can happen *before* a session cookie
 * exists (Supabase projects requiring email confirmation return a user
 * with session: null — see signup/page.tsx's own comment on this). Every
 * other client-triggered event goes through /api/analytics/track, which
 * resolves the user from the session cookie; that path would silently
 * drop this one specific event for exactly the population most important
 * to anchor a D1/D7 cohort for. Uses the service client rather than
 * requiring a session for the same reason cron routes do — there's a
 * real, already-known userId, just no session bound to this request yet.
 */
export async function recordSignupCompleted(userId: string): Promise<void> {
  const supabase = createServiceClient();
  await recordEvent(supabase, userId, { name: "signup_completed", properties: { method: "email" } });
}
