import { ruleBasedLearningBrain } from "./rule-engine";
import type { LearningBrain } from "./types";

/**
 * The one import every caller (Today's Mission, Tuto Recommends, Explore's
 * default sort, future Search ranking) uses — never `./rule-engine`
 * directly. Swapping V1 (rule-based) for V2 (a learned model) means
 * changing this one line; every caller, the UI, routing, and the database
 * schema stay untouched (docs/dashboard-architecture.md §8).
 */
export const learningBrain: LearningBrain = ruleBasedLearningBrain;

export type { LearnerContext, LearningBrain } from "./types";
