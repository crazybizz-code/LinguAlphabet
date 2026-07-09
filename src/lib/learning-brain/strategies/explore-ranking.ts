import type { ContentItem } from "@/types/content";
import type { LearnerContext } from "../types";
import { ruleBasedLearningBrain } from "../rule-engine";

/**
 * Layer 3: Explore's default sort is the same Layer 2 score as
 * everything else (docs/content-lifecycle.md §6) — relevance-first, not
 * chronological or alphabetical, with manual filters (level, topic,
 * duration) layered on top as an opt-in override, never the primary path.
 */
export const exploreRankingStrategy = {
  rank<T extends ContentItem>(catalog: T[], context: LearnerContext): Promise<T[]> {
    return ruleBasedLearningBrain.rank(catalog, context);
  },
};
