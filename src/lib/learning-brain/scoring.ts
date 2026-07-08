import type { ContentItem } from "@/types/content";
import type { LearnerContext } from "./types";
import { cefrDistance } from "./cefr";

/**
 * Rule-based V1 scoring (docs/content-lifecycle.md §3):
 *
 *   score = level_match + goal_alignment_match + topic_overlap + freshness
 *           + variety_bonus - repetition_penalty
 *
 * Deterministic and explainable by design — not a black box. The weights
 * below are v1 tuning constants, not part of the documented contract; the
 * *shape* of the formula (which signals count, and repetition being a
 * steep penalty rather than a hard exclusion) is what's load-bearing.
 */
const WEIGHTS = {
  levelMatch: 40,
  levelAdjacent: 15,
  goalAlignmentMatch: 25,
  topicOverlapPerTag: 8,
  topicOverlapCap: 24,
  freshnessMax: 15,
  freshnessWindowDays: 30,
  varietyBonus: 10,
  repetitionPenaltyCompleted: 50,
} as const;

function levelMatchScore(item: ContentItem, englishLevel: string | null): number {
  if (!englishLevel) return 0;
  if (englishLevel >= item.cefrLevelMin && englishLevel <= item.cefrLevelMax) return WEIGHTS.levelMatch;
  const distance = Math.min(cefrDistance(englishLevel, item.cefrLevelMin), cefrDistance(englishLevel, item.cefrLevelMax));
  return distance === 1 ? WEIGHTS.levelAdjacent : 0;
}

function goalAlignmentScore(item: ContentItem, goal: string | null): number {
  if (!goal) return 0;
  return item.goalAlignment.includes(goal) ? WEIGHTS.goalAlignmentMatch : 0;
}

function topicOverlapScore(item: ContentItem, interests: string[]): number {
  const shared = item.topics.filter((topic) => interests.includes(topic)).length;
  return Math.min(shared * WEIGHTS.topicOverlapPerTag, WEIGHTS.topicOverlapCap);
}

function freshnessScore(item: ContentItem, now: Date): number {
  const publishedAt = new Date(item.publishedAt).getTime();
  const ageDays = (now.getTime() - publishedAt) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return WEIGHTS.freshnessMax;
  if (ageDays >= WEIGHTS.freshnessWindowDays) return 0;
  return WEIGHTS.freshnessMax * (1 - ageDays / WEIGHTS.freshnessWindowDays);
}

function varietyScore(item: ContentItem, previousMissionContentType: ContentItem["contentType"] | null): number {
  if (!previousMissionContentType) return 0;
  return item.contentType !== previousMissionContentType ? WEIGHTS.varietyBonus : 0;
}

function repetitionPenalty(item: ContentItem, completedContentIds: ReadonlySet<string>): number {
  return completedContentIds.has(item.id) ? WEIGHTS.repetitionPenaltyCompleted : 0;
}

export function scoreContent(item: ContentItem, context: LearnerContext, now: Date = new Date()): number {
  return (
    levelMatchScore(item, context.englishLevel) +
    goalAlignmentScore(item, context.goal) +
    topicOverlapScore(item, context.interests) +
    freshnessScore(item, now) +
    varietyScore(item, context.previousMissionContentType) -
    repetitionPenalty(item, context.completedContentIds)
  );
}
