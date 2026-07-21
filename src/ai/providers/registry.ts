import type { AIProvider } from "./types";

/** Mirrors src/lib/content-engine/providers/registry.ts's registerProvider()/getProvider() pattern. */
const providers = new Map<string, AIProvider>();

export function registerProvider(provider: AIProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): AIProvider {
  const provider = providers.get(id);
  if (!provider) {
    const known = [...providers.keys()].join(", ") || "none";
    throw new Error(`AI provider "${id}" is not registered. Registered providers: ${known}`);
  }
  return provider;
}
