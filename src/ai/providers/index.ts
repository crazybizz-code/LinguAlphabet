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
