import type { AIUsageEvent, UsageSink } from "./types";

export * from "./types";
export { estimateCostUsd, getModelPricing, MODEL_PRICING } from "./pricing";

/**
 * The active sink. Null means telemetry is disabled — the default, so
 * that any context without a configured sink (unit tests, scripts, a
 * local run with no database) silently records nothing rather than
 * erroring or needing to stub anything.
 */
let sink: UsageSink | null = null;

export function setUsageSink(next: UsageSink | null): void {
  sink = next;
}

/**
 * Records one usage event.
 *
 * Swallows every error by design. A telemetry write must never surface
 * as a failure of the learner's actual request — the same posture
 * recordExplanationRequested() and the signal repository already take
 * for best-effort bookkeeping elsewhere in src/ai.
 *
 * Awaited by the caller rather than fire-and-forget: on a serverless
 * request handler there is no guarantee that work continues after the
 * response is sent, so an un-awaited insert here is an insert that
 * frequently never lands. That costs a few ms per AI call and is the
 * reason the data can be trusted to be complete.
 */
export async function recordUsage(event: AIUsageEvent): Promise<void> {
  if (!sink) return;
  try {
    await sink.record(event);
  } catch {
    // Intentionally silent — see above.
  }
}
