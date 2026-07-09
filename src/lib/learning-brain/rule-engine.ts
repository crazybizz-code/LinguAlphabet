import type { ContentItem } from "@/types/content";
import type { LearnerContext, LearningBrainRanker } from "./types";
import { scoreContent } from "./scoring";

/**
 * V1 implementation of Layer 2 scoring (docs/content-lifecycle.md §3),
 * shared by every Layer 3 strategy that needs a ranked list (Today's
 * Mission's fresh-pick fallback, Tuto Recommends, Explore Ranking). This
 * is the piece docs/dashboard-architecture.md §8 expects to eventually
 * swap for a learned model — strategies only ever see the
 * `LearningBrainRanker` interface, never this class, so that swap is a
 * one-file change (./index.ts).
 */
class RuleBasedLearningBrain implements LearningBrainRanker {
  async rank<T extends ContentItem>(catalog: T[], context: LearnerContext): Promise<T[]> {
    const now = new Date();
    return [...catalog].sort((a, b) => scoreContent(b, context, now) - scoreContent(a, context, now));
  }
}

export const ruleBasedLearningBrain = new RuleBasedLearningBrain();
