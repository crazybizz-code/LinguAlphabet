/**
 * src/ai/turn-classifier — Phase 8: the runtime perception layer.
 * Interprets the learner's latest message into a TurnSignal (an outcome
 * plus a confidence score) and nothing more. It never decides teaching
 * strategy (that's src/ai/coach-planner) and never decides lesson flow
 * (that's src/ai/learning-orchestrator) — this module only perceives.
 * Kept strictly independent, never merged into the Orchestrator, so the
 * three responsibilities — perceive, decide, speak — can each change
 * without touching the other two.
 *
 * The one module in src/ai's deterministic pipeline that is not itself
 * deterministic: unlike learning-engine/coach-planner/learning-session-engine/
 * learning-orchestrator (pure functions, no I/O), classifyTurn() makes a
 * real model call, because distinguishing frustration from confusion
 * requires reading meaning out of free text, not evaluating rules against
 * structured evidence.
 */
export type { TurnSignal, TurnSignalOutcome, ClassifyTurnInput } from "./types";
export { TURN_SIGNAL_OUTCOMES } from "./types";
export { classifyTurn } from "./classifier";
