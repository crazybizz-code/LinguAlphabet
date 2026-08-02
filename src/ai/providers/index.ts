import { bootstrapProviders } from "./bootstrap";
import { getProvider } from "./registry";
import { AIProviderError } from "./errors";
import type { AIProvider } from "./types";

export * from "./types";
export { AIProviderError } from "./errors";

/**
 * True when a failure is a quota / rate-limit refusal (HTTP 429).
 *
 * Exists so a caller can distinguish "the model is fine, we asked too
 * fast" from "the API is erroring" WITHOUT importing a specific
 * provider's error class. The Content Engine pipeline used to import
 * GeminiRateLimitError for exactly this, which quietly made a
 * provider-agnostic pipeline depend on one provider.
 */
export function isRateLimitError(error: unknown): boolean {
  return error instanceof AIProviderError && error.status === 429;
}
export { registerProvider, getProvider } from "./registry";

const DEFAULT_PROVIDER_ID = "openrouter";

/** Swappable via AI_PROVIDER without touching any call site (src/ai/services, the API route). */
function getActiveProviderId(): string {
  return process.env.AI_PROVIDER || DEFAULT_PROVIDER_ID;
}

export function getDefaultProvider(): AIProvider {
  bootstrapProviders();
  return getProvider(getActiveProviderId());
}

export interface ProviderConfigurationStatus {
  providerId: string;
  ok: boolean;
  missing: string[];
}

/**
 * Preflight: is the AI layer usable, and if not, what is missing?
 *
 * Asks whichever provider AI_PROVIDER selected, so a caller never needs
 * to know which environment variables that provider reads. A batch job
 * can then fail in the first second with an actionable message instead
 * of part-way through, and swapping providers cannot leave a stale
 * credential name hardcoded in an unrelated file — which is exactly the
 * bug this replaced.
 *
 * A provider that declares no requirements is reported as configured.
 */
export function checkProviderConfiguration(provider: AIProvider = getDefaultProvider()): ProviderConfigurationStatus {
  const status = provider.checkConfiguration?.() ?? { ok: true, missing: [] };
  return { providerId: provider.id, ok: status.ok, missing: status.missing };
}
