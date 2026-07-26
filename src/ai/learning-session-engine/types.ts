import type { LearningContext } from "@/ai/context";
import type { LearnerState } from "@/ai/learning-engine";
import type { TeachingPlan } from "@/ai/coach-planner";

export const SESSION_STEP_TYPES = [
  "warm-up",
  "review",
  "explanation",
  "guided-practice",
  "independent-practice",
  "check-understanding",
  "reflection",
  "celebration",
] as const;
export type SessionStepType = (typeof SESSION_STEP_TYPES)[number];

export interface LearningSessionStep {
  type: SessionStepType;
  /** Only set on topic-bearing step types (explanation, guided-practice, independent-practice, check-understanding, review) — warm-up/reflection/celebration are never topic-specific. */
  topic: string | null;
  goal: string;
  /** A conversational-turn budget for pacing — never a literal timer. How much of the session this step should occupy relative to the others, not a promise about real-world minutes (that's estimatedDuration, a coarser, session-level figure). */
  estimatedExchanges: number;
}

export interface SessionReviewPoint {
  topic: string;
  reason: string;
  /** Index into `steps` this review should be raised after — never at the very start, a review needs somewhere to interrupt. */
  afterStepIndex: number;
}

export const COMPLETION_BEHAVIORS = ["celebrate-and-continue", "celebrate-and-suggest-break", "quiet-continue", "celebrate-milestone"] as const;
export type CompletionBehavior = (typeof COMPLETION_BEHAVIORS)[number];

export interface SessionPlanEvidenceRef {
  field: string;
  detail: string;
}

/**
 * The Learning Session Engine's output (Phase 6) — the structure of a
 * single teaching session, decided deterministically before the LLM ever
 * sees it. The LLM enacts this (chooses the exact words, adapts tone
 * turn to turn) but never invents the flow, pacing, or when to review or
 * celebrate — that's this module's job, same separation of concerns
 * TeachingPlan already established one layer up.
 */
export interface LearningSessionPlan {
  /** Deliberately identical to the originating TeachingPlan.goal — one authoritative statement of purpose, not two subtly different ones invented at two layers. */
  sessionGoal: string;
  /** Human-readable, e.g. "5-8 minutes" — a coarse session-level estimate, derived from the sum of steps' estimatedExchanges, never a literal promise. */
  estimatedDuration: string;
  steps: LearningSessionStep[];
  reviewPoints: SessionReviewPoint[];
  successCriteria: string;
  completionBehavior: CompletionBehavior;
  /** Every field above traces back to one of these — same "traceable to evidence" discipline as TeachingPlan.basedOn (src/ai/coach-planner) and LearnerState (src/ai/learning-engine). */
  basedOn: SessionPlanEvidenceRef[];
}

export interface SessionEngineInput {
  teachingPlan: TeachingPlan;
  learnerState: LearnerState;
  learningContext: LearningContext;
}
