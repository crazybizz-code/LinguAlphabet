import type { CefrLevel } from "@/ai/context";
import type { TopicMasteryRecord } from "@/ai/learning-engine";
import type { AIAvailableContentSummary } from "@/ai/data";
import type { CoachPlannerInput, TeachingPlan, TeachingPlanEvidenceRef, TeachingStrategy, ConversationMode, TeachingStyleRecommendation } from "./types";

function pickWeakest(records: TopicMasteryRecord[]): TopicMasteryRecord | null {
  const weak = records.filter((record) => record.status === "weak");
  if (weak.length === 0) return null;
  // Most evidence of failure first (a repeated pattern, not noise), most recent as the tiebreaker.
  return [...weak].sort(
    (a, b) => b.evidenceCount - a.evidenceCount || new Date(b.lastEvidenceAt).getTime() - new Date(a.lastEvidenceAt).getTime(),
  )[0];
}

function pickStalest(records: TopicMasteryRecord[]): TopicMasteryRecord | null {
  if (records.length === 0) return null;
  return [...records].sort((a, b) => new Date(a.lastEvidenceAt).getTime() - new Date(b.lastEvidenceAt).getTime())[0];
}

function findMatchingContent(skill: string, availableContent: AIAvailableContentSummary[]): AIAvailableContentSummary | null {
  const normalized = skill.toLowerCase();
  return availableContent.find((content) => content.skills.some((contentSkill) => contentSkill.toLowerCase() === normalized)) ?? null;
}

/**
 * Grounds a topic in something real when possible. Deliberately honest
 * about the limits of the match: content is tagged by skill (Grammar,
 * Vocabulary, ...) and subject topic (Technology, Travel, ...), never by
 * a specific grammar-unit id or vocabulary word, so this can only ever
 * say "this exercises the right skill," never "this is specifically
 * about X" — claiming more than that would be exactly the kind of
 * asserted-not-derived conclusion this whole model exists to avoid.
 */
function describeOpportunity(topic: string, skill: string, availableContent: AIAvailableContentSummary[]): string {
  const match = findMatchingContent(skill, availableContent);
  if (match) return `Practice ${topic} — "${match.title}" (${match.contentType}) exercises ${skill}.`;
  return `Practice ${topic} in conversation — no matching ${skill} content is available to point to yet.`;
}

function recommendTeachingStyle(userLevel: CefrLevel | null): TeachingStyleRecommendation {
  return userLevel === "A1" || userLevel === "A2" ? "direct-instruction" : "guided-discovery";
}

interface PlanParams {
  strategy: TeachingStrategy;
  priorityTopic: string | null;
  goal: string;
  userLevel: CefrLevel | null;
  shouldProactivelyIntervene: boolean;
  interventionReason: string | null;
  conversationMode: ConversationMode;
  nextLearningOpportunity: string | null;
  basedOn: TeachingPlanEvidenceRef[];
}

function buildPlan(params: PlanParams): TeachingPlan {
  return {
    goal: params.goal,
    strategy: params.strategy,
    priorityTopic: params.priorityTopic,
    // Tracks the learner's own stated level, never recalculated per-turn —
    // deliberately: CEFR progression is a slow-moving signal over weeks
    // (docs/domain-model.md's Learning Brain "Layer 4 — Progression"),
    // not something a single conversation should nudge up or down.
    recommendedDifficulty: params.userLevel,
    teachingStyle: recommendTeachingStyle(params.userLevel),
    shouldProactivelyIntervene: params.shouldProactivelyIntervene,
    interventionReason: params.interventionReason,
    conversationMode: params.conversationMode,
    nextLearningOpportunity: params.nextLearningOpportunity,
    basedOn: params.basedOn,
  };
}

/**
 * LearnerState → Teaching Plan (Phase 4B). Pure and deterministic, the
 * same contract as src/ai/learning-engine's computeLearnerState(): no
 * I/O, no model call, same input always produces the same output. This
 * is the only place a teaching strategy gets decided — the LLM
 * (src/ai/prompts/tuto) receives the result and explains/enacts it in
 * its own voice, it never re-derives the strategy itself. "AI should not
 * infer what deterministic logic can calculate" applies here exactly as
 * it did to the Learning Engine; the difference is this function's job
 * is deciding what to do next, not just reporting what's true.
 *
 * Never reads raw signals — only LearnerState, LearningContext, and
 * AvailableContentSummary, exactly as scoped. This function's
 * responsibility ends at the plan; it never answers a learner's
 * question and never picks specific content to serve (that's a future,
 * separate Recommendation System) — nextLearningOpportunity only ever
 * references content already fetched by the caller, to make a
 * suggestion concrete rather than to rank or select what to show.
 *
 * Priority order, most urgent first: an unresolved grammar mistake
 * pattern > an unresolved vocabulary struggle > a stale-but-once-touched
 * topic worth reviewing > dropping engagement > moving forward to new
 * material > admitting there isn't enough evidence yet. Each rule only
 * fires on real LearnerState evidence — never a guess when the state
 * doesn't support one.
 */
export function planTeaching(input: CoachPlannerInput): TeachingPlan {
  const { learnerState, learningContext, availableContent } = input;
  const userLevel = learningContext.userLevel;

  const weakestGrammar = pickWeakest(learnerState.grammarMastery);
  if (weakestGrammar) {
    return buildPlan({
      strategy: "reinforce-weak-topic",
      priorityTopic: weakestGrammar.topic,
      goal: `Reinforce ${weakestGrammar.topic} before introducing new grammar.`,
      userLevel,
      shouldProactivelyIntervene: true,
      interventionReason: `${weakestGrammar.evidenceCount} recent quiz answers on "${weakestGrammar.topic}" came back incorrect with no correct answer since.`,
      conversationMode: "focused-practice",
      nextLearningOpportunity: describeOpportunity(weakestGrammar.topic, "grammar", availableContent),
      basedOn: [
        {
          field: `grammarMastery.${weakestGrammar.topic}`,
          detail: `status=weak, evidenceCount=${weakestGrammar.evidenceCount}, confidence=${weakestGrammar.confidence}, lastEvidenceAt=${weakestGrammar.lastEvidenceAt}`,
        },
      ],
    });
  }

  const weakestVocabulary = pickWeakest(learnerState.vocabularyMastery);
  if (weakestVocabulary) {
    return buildPlan({
      strategy: "reinforce-weak-topic",
      priorityTopic: weakestVocabulary.topic,
      goal: `Reinforce the word "${weakestVocabulary.topic}."`,
      userLevel,
      shouldProactivelyIntervene: true,
      interventionReason: `"${weakestVocabulary.topic}" has been looked up ${weakestVocabulary.evidenceCount} times — it hasn't stuck yet.`,
      conversationMode: "focused-practice",
      nextLearningOpportunity: describeOpportunity(weakestVocabulary.topic, "vocabulary", availableContent),
      basedOn: [
        {
          field: `vocabularyMastery.${weakestVocabulary.topic}`,
          detail: `status=weak, evidenceCount=${weakestVocabulary.evidenceCount}, confidence=${weakestVocabulary.confidence}, lastEvidenceAt=${weakestVocabulary.lastEvidenceAt}`,
        },
      ],
    });
  }

  const staleTopic = pickStalest(learnerState.reviewCandidates);
  if (staleTopic) {
    return buildPlan({
      strategy: "review-stale-topic",
      priorityTopic: staleTopic.topic,
      goal: `Resurface "${staleTopic.topic}" before it fades.`,
      userLevel,
      shouldProactivelyIntervene: false,
      interventionReason: null,
      conversationMode: "focused-practice",
      nextLearningOpportunity: describeOpportunity(staleTopic.topic, staleTopic.skill, availableContent),
      basedOn: [{ field: `reviewCandidates.${staleTopic.topic}`, detail: `status=${staleTopic.status}, lastEvidenceAt=${staleTopic.lastEvidenceAt}` }],
    });
  }

  if (learnerState.momentum.trend === "decreasing") {
    return buildPlan({
      strategy: "maintain-momentum",
      priorityTopic: null,
      goal: "Re-engage — study momentum is dropping.",
      userLevel,
      shouldProactivelyIntervene: true,
      interventionReason: `Completions have slowed over the recent window (recentSessionCount=${learnerState.momentum.recentSessionCount}).`,
      conversationMode: "check-in",
      nextLearningOpportunity: null,
      basedOn: [{ field: "momentum", detail: `trend=decreasing, recentSessionCount=${learnerState.momentum.recentSessionCount}` }],
    });
  }

  if (learnerState.topicMastery.length > 0 || learnerState.recentlyStudiedTopics.length > 0) {
    return buildPlan({
      strategy: "introduce-new-topic",
      priorityTopic: null,
      goal: "Move forward — no unresolved weak spots right now.",
      userLevel,
      shouldProactivelyIntervene: false,
      interventionReason: null,
      conversationMode: "open-ended",
      nextLearningOpportunity: null,
      basedOn: [{ field: "topicMastery", detail: "no weak or stale topics found" }],
    });
  }

  return buildPlan({
    strategy: "insufficient-data",
    priorityTopic: null,
    goal: "Get to know this learner — not enough signal history yet.",
    userLevel,
    shouldProactivelyIntervene: false,
    interventionReason: null,
    conversationMode: "open-ended",
    nextLearningOpportunity: null,
    basedOn: [{ field: "topicMastery", detail: "empty — no signal history yet" }],
  });
}
