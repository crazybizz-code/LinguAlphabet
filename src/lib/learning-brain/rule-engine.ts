import type { ContentItem } from "@/types/content";
import type { LearnerContext, LearningBrain } from "./types";
import { scoreContent } from "./scoring";

/**
 * V1 implementation of the Learning Brain: deterministic rule-based
 * scoring (docs/content-lifecycle.md §3). This is the piece
 * docs/dashboard-architecture.md §8 expects to eventually swap for a
 * learned model — everything importing `learningBrain` from ./index
 * only ever sees the `LearningBrain` interface, never this class, so
 * that swap is a one-file change.
 */
class RuleBasedLearningBrain implements LearningBrain {
  async rank<T extends ContentItem>(catalog: T[], context: LearnerContext): Promise<T[]> {
    const now = new Date();
    return [...catalog].sort((a, b) => scoreContent(b, context, now) - scoreContent(a, context, now));
  }
}

export const ruleBasedLearningBrain = new RuleBasedLearningBrain();
