import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import type { AnalyticsEvent } from "./events";

/**
 * The one write path into analytics_events — used directly by server
 * actions/routes that already have a supabase client + userId in scope
 * (complete-mission.ts, the push routes, the cron), and indirectly by
 * client-triggered events via /api/analytics/track. Best-effort, same
 * posture as recordCompletionSignals in complete-mission.ts: a telemetry
 * write failing must never turn a real user action into a reported
 * failure, so this never throws.
 */
export async function recordEvent(
  supabase: SupabaseClient<Database>,
  userId: string,
  event: AnalyticsEvent,
): Promise<void> {
  try {
    await supabase.from("analytics_events").insert({
      user_id: userId,
      event_name: event.name,
      properties: event.properties as unknown as Json,
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}
