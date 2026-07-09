import type { ContentItem } from "@/types/content";

/** One field contributed to an item's searchable corpus, weighted by how strongly a match there should count (docs/dashboard-architecture.md §9). */
export interface SearchableField {
  text: string;
  weight: number;
}

/**
 * The stable seam between "the rest of the app" and "however search
 * relevance gets computed." Mirrors LearningBrainRanker's shape
 * (docs/dashboard-architecture.md §8) for the same reason: swapping
 * deterministic matching for an AI-powered ranker (embedding similarity,
 * semantic search) later means implementing this interface differently,
 * not changing any caller — async today, even though the rule-based
 * ranker resolves synchronously, so a future network-bound ranker is a
 * drop-in.
 */
export interface SearchRanker {
  rank<T extends ContentItem>(catalog: T[], query: string): Promise<T[]>;
}
