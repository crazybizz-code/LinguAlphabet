import { registerProvider } from "./registry";
import { createOpenRouterProvider } from "./openrouter";
import { bootstrapUsageTelemetry } from "@/ai/telemetry/supabase-sink";

let bootstrapped = false;

/**
 * Idempotent — safe to call on every request; only registers providers
 * once per server instance.
 *
 * Usage telemetry is installed here because getDefaultProvider() is the
 * single gate every AI call already passes through, so there is no code
 * path that can obtain a provider without its usage being recorded. A
 * missing service-role key leaves the sink unset and telemetry simply
 * off (src/ai/telemetry/supabase-sink.ts) rather than failing calls.
 */
export function bootstrapProviders(): void {
  if (bootstrapped) return;
  registerProvider(createOpenRouterProvider());
  bootstrapUsageTelemetry();
  bootstrapped = true;
}
