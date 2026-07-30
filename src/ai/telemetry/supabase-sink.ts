import { createServiceClient } from "@/lib/supabase/service-client";
import type { AIUsageEvent, UsageSink } from "./types";

/**
 * Writes usage events to `ai_usage_events`
 * (supabase/ai-usage-telemetry-schema.sql).
 *
 * Uses the service-role client for the same reason the Content Engine
 * does: this is infrastructure bookkeeping that must succeed regardless
 * of which learner (if any) triggered the request, and several AI calls
 * — the daily ingest cron, the turn classifier — have no user session at
 * all. The table carries no learner-identifying data for that reason;
 * see the migration's own note.
 */
export function createSupabaseUsageSink(): UsageSink {
  return {
    async record(event: AIUsageEvent): Promise<void> {
      const supabase = createServiceClient();
      await supabase.from("ai_usage_events").insert({
        model: event.model,
        feature: event.feature,
        input_tokens: event.inputTokens,
        output_tokens: event.outputTokens,
        total_tokens: event.totalTokens,
        latency_ms: event.latencyMs,
        estimated_cost_usd: event.estimatedCostUsd,
        ok: event.ok,
        streamed: event.streamed,
      });
    },
  };
}

let bootstrapped = false;

/**
 * Installs the Supabase sink once per server instance. Idempotent, and
 * a no-op when the service-role key is absent (local runs, CI) so
 * telemetry simply stays off rather than throwing on every AI call.
 */
export function bootstrapUsageTelemetry(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  // Imported lazily to keep this module free of a hard dependency cycle
  // with ./index, which re-exports the types this file uses.
  void import("./index").then(({ setUsageSink }) => setUsageSink(createSupabaseUsageSink()));
}
