/**
 * src/ai/coach-planner — Phase 4B: LearnerState → Teaching Plan. A pure,
 * deterministic decision layer, same shape as src/ai/learning-engine:
 * no I/O, no model call. Where the Learning Engine is the student's
 * report card (what's true), this is the teacher deciding tomorrow's
 * lesson (what to do about it) — deliberately kept as a separate module
 * with a separate responsibility, never merged into the Learning Engine.
 *
 * Not built here, on purpose: content recommendation/ranking (a future,
 * separate Recommendation System) and any mechanism that actually acts
 * on `shouldProactivelyIntervene` (a future Proactive Coaching system —
 * this phase only computes the flag as data on the plan).
 */
export type {
  TeachingPlan,
  TeachingPlanEvidenceRef,
  TeachingStrategy,
  TeachingStyleRecommendation,
  ConversationMode,
  CoachPlannerInput,
} from "./types";
export { TEACHING_STRATEGIES, TEACHING_STYLE_RECOMMENDATIONS, CONVERSATION_MODES } from "./types";
export { planTeaching } from "./planner";
