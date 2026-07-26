import type { CefrLevel, LearningContext, Screen } from "@/ai/context";
import type { LearnerState } from "@/ai/learning-engine";
import type { AIAvailableContentSummary } from "@/ai/data";

export const TEACHING_STRATEGIES = ["reinforce-weak-topic", "review-stale-topic", "introduce-new-topic", "maintain-momentum", "insufficient-data"] as const;
export type TeachingStrategy = (typeof TEACHING_STRATEGIES)[number];

/** B1+ gets guided discovery, A1/A2 gets direct instruction — the exact calibration ACTIVE_LEARNING's prompt text already describes (src/ai/prompts/tuto/sections.ts), now decided here instead of left for the model to infer alone every turn. */
export const TEACHING_STYLE_RECOMMENDATIONS = ["guided-discovery", "direct-instruction"] as const;
export type TeachingStyleRecommendation = (typeof TEACHING_STYLE_RECOMMENDATIONS)[number];

export const CONVERSATION_MODES = ["focused-practice", "check-in", "open-ended"] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];

export interface TeachingPlanEvidenceRef {
  field: string;
  detail: string;
}

/**
 * The Coach Planner's output (Phase 4B) — what Tuto should teach next,
 * decided deterministically, never invented by the LLM at request time.
 * The LLM receives this alongside LearningContext and LearnerState
 * (src/ai/prompts/tuto's teaching-plan-block.ts) and explains/enacts it
 * in its own voice — it never re-derives the strategy itself.
 */
export interface TeachingPlan {
  goal: string;
  strategy: TeachingStrategy;
  priorityTopic: string | null;
  recommendedDifficulty: CefrLevel | null;
  teachingStyle: TeachingStyleRecommendation;
  shouldProactivelyIntervene: boolean;
  interventionReason: string | null;
  conversationMode: ConversationMode;
  nextLearningOpportunity: string | null;
  /** Every field above traces back to one of these — never an assertion with nothing behind it, the same "traceable to evidence" rule LearnerState follows (src/ai/learning-engine). */
  basedOn: TeachingPlanEvidenceRef[];
}

export interface CoachPlannerInput {
  learnerState: LearnerState;
  learningContext: LearningContext;
  /** Same value as learningContext.currentScreen — named explicitly here so this input list is self-documenting without a reader needing to know LearningContext's internal shape. */
  currentScreen: Screen | null;
  availableContent: AIAvailableContentSummary[];
}
