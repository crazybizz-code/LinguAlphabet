import { cefrIndex } from "@/lib/learning-brain/cefr";
import type { ArticleContent, PodcastContent } from "@/types/content";

/**
 * The "why this, for you" line under each Home recommendation (Base44
 * dashboard redesign, Phase 1).
 *
 * The Base44 export writes claims like "Improves Matching Headings — your
 * weakest reading skill." We have no per-skill weakness data — that comes
 * from the placement assessment and the mock engine, neither of which
 * exists yet — so reproducing that copy would be a fabricated diagnosis
 * presented as a personal insight. Instead this states the signal that
 * actually decided the ranking.
 *
 * That's not a downgrade for honesty's sake: level match is the single
 * heaviest weight in the rule engine (40, vs 25 for goal alignment and 24
 * capped for topic overlap — src/lib/learning-brain/scoring.ts), so the
 * level clause genuinely is the dominant reason this item ranked where it
 * did. Topic overlap is appended when it also contributed.
 *
 * When per-skill data lands, this is the one function that changes; every
 * caller keeps rendering whatever string it returns.
 */

type Recommendation = PodcastContent | ArticleContent;

function practiceNoun(item: Recommendation): string {
  return item.contentType === "article" ? "Reading practice" : "Listening practice";
}

/** The first topic the learner actually said they were interested in, or null. */
function sharedTopic(item: Recommendation, interests: readonly string[]): string | null {
  return item.topics.find((topic) => interests.includes(topic)) ?? null;
}

export function buildRecommendationReason(
  item: Recommendation,
  learner: { englishLevel: string | null; interests: readonly string[] },
): string {
  const noun = practiceNoun(item);
  const topic = sharedTopic(item, learner.interests);
  const topicClause = topic ? `, on ${topic.toLowerCase()}` : "";

  const learnerIndex = learner.englishLevel ? cefrIndex(learner.englishLevel) : -1;
  const itemMinIndex = cefrIndex(item.cefrLevelMin);
  const itemMaxIndex = cefrIndex(item.cefrLevelMax);

  // No usable level on either side — say only what we can stand behind.
  if (learnerIndex === -1 || itemMinIndex === -1 || itemMaxIndex === -1) {
    return topic ? `${noun}${topicClause}.` : `${noun} picked for you by Tuto.`;
  }

  if (learnerIndex >= itemMinIndex && learnerIndex <= itemMaxIndex) {
    return `${noun} matched to your level (${learner.englishLevel})${topicClause}.`;
  }

  if (learnerIndex < itemMinIndex) {
    return `${noun} above ${learner.englishLevel}${topicClause} — a deliberate stretch.`;
  }

  return `${noun} below ${learner.englishLevel}${topicClause} — builds speed and confidence.`;
}
