import { bootstrapProviders } from "./bootstrap";
import { getProvider } from "./registry";
import type { AIProvider } from "./types";

export * from "./types";
export { AIProviderError } from "./errors";
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
