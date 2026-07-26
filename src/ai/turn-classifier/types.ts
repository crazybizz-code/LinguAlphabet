export const TURN_SIGNAL_OUTCOMES = ["understood", "confused", "requested_hint", "frustration", "curiosity", "off_topic", "mastered", "needs_review"] as const;
export type TurnSignalOutcome = (typeof TURN_SIGNAL_OUTCOMES)[number];

/**
 * The Turn Classifier's only output (Phase 8) — a perception, not a
 * decision. `confidence` (0-1) is the classifier's own self-reported
 * certainty, the same Tier 3 shape as every other AI-judgment producer in
 * this system (docs/learning-signal-specification.md): a real number
 * grounded in the model's own uncertainty, never faked when absent — see
 * classifier.ts's classifyTurn(), which returns null rather than a
 * guessed signal when classification isn't possible.
 *
 * src/ai/learning-orchestrator is the only consumer. It decides what, if
 * anything, to do about a TurnSignal — this module never reasons about
 * teaching strategy or lesson flow, only about what the learner's message
 * itself shows.
 */
export interface TurnSignal {
  outcome: TurnSignalOutcome;
  confidence: number;
}

export interface ClassifyTurnInput {
  /** The learner's latest message — the only thing actually being classified. */
  learnerMessage: string;
  /** What Tuto just said, if anything — context for what the learner is responding to, never itself classified. */
  priorAssistantMessage?: string | null;
}
