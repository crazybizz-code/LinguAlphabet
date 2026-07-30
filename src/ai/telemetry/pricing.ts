/**
 * Model pricing for the estimated-cost column of usage telemetry.
 *
 * IMPORTANT — these are a SNAPSHOT, not a live feed. OpenRouter changes
 * prices without notice, so a stored `estimated_cost_usd` is an estimate
 * for trend-watching and per-feature comparison, never a billing record.
 * The authoritative number is always OpenRouter's own dashboard.
 *
 * Verify against https://openrouter.ai/models before trusting an
 * absolute figure. Prices are USD per 1,000,000 tokens.
 *
 * An unknown model yields NULL cost, never 0 — a silent zero would make
 * an unpriced model look free and quietly corrupt any spend total built
 * on this table. Nulls are visible; zeros are not.
 */

export interface ModelPricing {
  /** USD per 1M input (prompt) tokens. */
  inputPerMillion: number;
  /** USD per 1M output (completion) tokens. */
  outputPerMillion: number;
}

/**
 * Keyed by OpenRouter model slug. Kept deliberately small — only models
 * this deployment actually runs — so it can't rot into a stale
 * catalogue of everything OpenRouter offers.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  // The Closed Beta model. Roughly an order of magnitude cheaper than the
  // GPT-5.5-class model it replaces, which is the point of the switch.
  "google/gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  "google/gemini-2.5-flash-lite": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  // Retained so historical rows written before the switch still price.
  "openai/gpt-5.5": { inputPerMillion: 1.25, outputPerMillion: 10.0 },
};

/**
 * Per-deployment overrides, so a price change is a config edit rather
 * than a deploy. Format: `slug:input,output;slug:input,output`.
 * A malformed entry is skipped rather than throwing — pricing metadata
 * must never be able to break an actual AI request.
 */
function parsePricingOverrides(raw: string | undefined): Record<string, ModelPricing> {
  if (!raw) return {};
  const overrides: Record<string, ModelPricing> = {};
  for (const entry of raw.split(";")) {
    const [slug, rates] = entry.split(":");
    if (!slug || !rates) continue;
    const [input, output] = rates.split(",").map(Number);
    if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
    overrides[slug.trim()] = { inputPerMillion: input, outputPerMillion: output };
  }
  return overrides;
}

export function getModelPricing(model: string): ModelPricing | null {
  const overrides = parsePricingOverrides(process.env.AI_MODEL_PRICING);
  return overrides[model] ?? MODEL_PRICING[model] ?? null;
}

/**
 * Estimated USD for one request. Returns null for an unpriced model
 * (see the file comment) and for missing token counts — a cost computed
 * from absent usage data would be a fabricated number.
 */
export function estimateCostUsd(model: string, inputTokens: number | null, outputTokens: number | null): number | null {
  const pricing = getModelPricing(model);
  if (!pricing || inputTokens === null || outputTokens === null) return null;

  const cost = (inputTokens / 1_000_000) * pricing.inputPerMillion + (outputTokens / 1_000_000) * pricing.outputPerMillion;
  // 6dp: a single cheap request can cost well under a cent, and rounding
  // those to 0 would erase exactly the per-request detail this exists for.
  return Number(cost.toFixed(6));
}
