/**
 * AI usage telemetry — one record per provider request.
 *
 * The audit found `AIProviderUsage` was parsed off every OpenRouter
 * response and then discarded: nothing read it, nothing stored it, so
 * there was no way to measure spend, compare features, or verify that a
 * model switch actually saved anything. This is the missing sink.
 *
 * Deliberately a narrow interface with a pluggable sink rather than a
 * direct Supabase call inside the provider: the provider layer must stay
 * free of database concerns (it is the one piece a future provider
 * reimplements), and tests need to assert on recorded events without a
 * database.
 */

export interface AIUsageEvent {
  /** Exact model slug that served the request, as configured at call time. */
  model: string;
  /** Which part of the product spent this — "chat", "turn_classifier", "vocabulary_explanation", … */
  feature: string;
  /** Null when the provider did not report usage (e.g. a streamed response without a usage frame) — never silently 0. */
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** Wall-clock duration of the provider call, in milliseconds. */
  latencyMs: number;
  /** Null for an unpriced model or absent token counts — see ./pricing.ts. */
  estimatedCostUsd: number | null;
  /** False when the provider call threw; the row is still written, because failed calls cost latency and often tokens too. */
  ok: boolean;
  /** Whether this was a streaming request — streams frequently lack usage data. */
  streamed: boolean;
}

/**
 * Where recorded events go. Implementations must never throw: telemetry
 * is bookkeeping, and a metrics failure must not fail a learner's
 * request.
 */
export interface UsageSink {
  record(event: AIUsageEvent): Promise<void>;
}
