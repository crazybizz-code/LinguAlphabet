import { dailyMissionGenerator } from "./strategies/daily-mission-generator";
import { exploreRankingStrategy } from "./strategies/explore-ranking";
import { difficultyProgressionStrategy } from "./strategies/difficulty-progression";
import { tutoRecommendsStrategy } from "./strategies/tuto-recommends";

/**
 * The one import every caller uses — Home, Explore, and future Search
 * ranking never import a strategy file directly, and never know which
 * strategy produced a result. Each method here delegates to an
 * independent, single-responsibility strategy (see ./strategies/):
 *
 *   - getHomeRecommendations → Daily Mission Generator, which composes
 *     Continue Learning + Today's Mission + Tuto Recommends
 *   - getExploreRanking      → Explore Ranking Strategy
 *   - getTutoRecommends      → Tuto Recommends Strategy
 *   - getEffectiveLevel      → Difficulty Progression Strategy
 *
 * Swapping any one strategy's internals (rule-based → a learned model)
 * means editing that strategy's file, never this one, and never a
 * caller (docs/dashboard-architecture.md §8).
 */
export const learningBrain = {
  getHomeRecommendations: dailyMissionGenerator.generate,
  getExploreRanking: exploreRankingStrategy.rank,
  getTutoRecommends: tutoRecommendsStrategy.pick,
  getEffectiveLevel: difficultyProgressionStrategy.computeEffectiveLevel,
};

export type { LearnerContext, LearningBrainRanker, Mission, MissionKind } from "./types";
export type { HomeRecommendations } from "./strategies/daily-mission-generator";
export type { RecentCompletion } from "./strategies/difficulty-progression";
