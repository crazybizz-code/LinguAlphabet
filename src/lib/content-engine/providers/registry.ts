import type { ContentProvider } from "../types";

/**
 * 1. Content Providers — where every source registers itself. Empty
 * today: no provider calls registerProvider() yet (docs/content-engine.md
 * — the RSS Articles task is entirely "implement ContentProvider, call
 * registerProvider() once," nothing else in the engine changes).
 */
const providers = new Map<string, ContentProvider>();

export function registerProvider(provider: ContentProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): ContentProvider | undefined {
  return providers.get(id);
}
