import type { ContentItem } from "@/types/content";
import type { SearchRanker } from "./types";
import { getSearchableFields } from "./extract";

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function scoreItem(item: ContentItem, normalizedQuery: string): number {
  return getSearchableFields(item).reduce((score, field) => {
    const occurrences = countOccurrences(field.text.toLowerCase(), normalizedQuery);
    return score + occurrences * field.weight;
  }, 0);
}

/**
 * V1 implementation of Universal Search: deterministic weighted
 * substring matching across every searchable field a content type
 * exposes (see ./extract.ts). Explainable and cheap at current catalog
 * size; swappable for embedding-based semantic search later — nothing
 * outside this file needs to change (./index.ts is the only import
 * point), same seam as the Learning Brain's rule engine.
 */
class RuleBasedSearchRanker implements SearchRanker {
  async rank<T extends ContentItem>(catalog: T[], query: string): Promise<T[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return catalog;

    return catalog
      .map((item) => ({ item, score: scoreItem(item, normalized) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }
}

export const ruleBasedSearchRanker = new RuleBasedSearchRanker();
