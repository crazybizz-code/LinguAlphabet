/**
 * src/ai/learning-session-engine — Phase 6: Teaching Plan → Learning
 * Session Plan. Sits between the Coach Planner and the LLM, same
 * deterministic-module shape as src/ai/learning-engine and
 * src/ai/coach-planner: no I/O, no model call. Where the Teaching Plan
 * decides *what* to teach and the overall strategy, this decides *how
 * the session unfolds* — lesson flow, pacing, exercise order, review
 * timing, reflection points, celebration moments. The LLM receives the
 * result and enacts it; it never invents session structure.
 *
 * Not the same thing as src/lib/learning-session (the existing,
 * UI-facing content-consumption stepper — Player/Reading/Dictionary/
 * Quiz/etc. for a specific article or podcast). This module plans the
 * shape of a Tuto *conversation*, not a content-item's screen sequence;
 * deliberately named close to what Phase 6 asked for while living under
 * src/ai/ so the two are never import-ambiguous.
 *
 * Not built here, on purpose: any UI, and any content/recommendation
 * selection — this module structures a session around whatever topic
 * the Teaching Plan already identified, it never picks new content
 * itself (see docs/ai-coach-audit.md's roadmap for where that belongs).
 */
export type {
  LearningSessionPlan,
  LearningSessionStep,
  SessionStepType,
  SessionReviewPoint,
  CompletionBehavior,
  SessionPlanEvidenceRef,
  SessionEngineInput,
} from "./types";
export { SESSION_STEP_TYPES, COMPLETION_BEHAVIORS } from "./types";
export { planLearningSession } from "./engine";
