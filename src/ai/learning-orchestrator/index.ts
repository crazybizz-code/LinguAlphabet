/**
 * src/ai/learning-orchestrator — Phase 7: SessionPlan → live lesson
 * control. The Learning Session Engine (src/ai/learning-session-engine)
 * produced a static plan; this module manages the dynamic, turn-by-turn
 * reality of actually running it — continue, repeat, simplify, give a
 * hint, celebrate, skip, escalate, or finish. Same deterministic-module
 * shape as learning-engine/coach-planner/learning-session-engine (no I/O,
 * no model call), with one deliberate exception: it cannot deterministically
 * interpret what the learner's last message *meant* (TurnSignal is
 * optional and supplied by a future turn-classifier), so judgment-gated
 * actions are honestly surfaced as openQuestions when that input is
 * absent rather than guessed.
 *
 * The Session Plan is static. The Orchestrator is dynamic. Never merge
 * those responsibilities — this module never rewrites steps, review
 * points, or success criteria, it only decides what to do with them right
 * now.
 *
 * Also the first module in this pipeline that requires genuine cross-turn
 * persisted state: OrchestratorRuntimeState (src/ai/data's
 * ConversationRepository) must be reloaded and saved every turn, unlike
 * learning-engine/coach-planner/learning-session-engine, which are pure
 * functions recomputed fresh from signals each time.
 */
export type {
  OrchestratorAction,
  TurnOutcome,
  TurnSignal,
  ConversationTurn,
  OrchestratorEvidenceRef,
  OrchestratorDecisionOpenQuestion,
  OrchestratorDecision,
  OrchestratorInput,
} from "./types";
export { ORCHESTRATOR_ACTIONS, TURN_OUTCOMES } from "./types";
export { orchestrateSession } from "./orchestrator";
