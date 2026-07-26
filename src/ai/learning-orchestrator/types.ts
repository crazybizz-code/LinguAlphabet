import type { LearningSessionPlan } from "@/ai/learning-session-engine";
import type { LearnerState } from "@/ai/learning-engine";
import type { OrchestratorRuntimeState } from "@/ai/data";

export const ORCHESTRATOR_ACTIONS = ["continue", "repeat", "simplify", "give-hint", "celebrate", "skip", "escalate", "finish"] as const;
export type OrchestratorAction = (typeof ORCHESTRATOR_ACTIONS)[number];

/**
 * How the learner's latest turn actually landed — the one input this
 * module cannot derive deterministically (it requires reading meaning out
 * of free text). Optional and supplied by a future turn-classifier; see
 * orchestrator.ts's applyTurnSignal() and the openQuestions it raises
 * when this is absent.
 */
export const TURN_OUTCOMES = ["correct", "incorrect", "confused", "help-requested", "off-topic", "unclear"] as const;
export type TurnOutcome = (typeof TURN_OUTCOMES)[number];

export interface TurnSignal {
  outcome: TurnOutcome;
  /** 0-1 — the classifier's own certainty, same Tier 3 shape as everywhere else a judgment enters this system. */
  confidence: number;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface OrchestratorEvidenceRef {
  field: string;
  detail: string;
}

/**
 * A decision this module could not make deterministically, and why —
 * same "stop and explicitly identify" discipline as
 * LearnerStateOpenQuestion (src/ai/learning-engine). Populated whenever a
 * judgment-gated action (repeat/simplify/give-hint/escalate) would need a
 * TurnSignal that wasn't supplied.
 */
export interface OrchestratorDecisionOpenQuestion {
  action: OrchestratorAction;
  reason: string;
}

/**
 * The Learning Orchestrator's output (Phase 7) — one decision about the
 * live lesson, plus the runtime state to persist for the next turn. The
 * LLM enacts the decision (chooses the wording) but never makes it — same
 * separation of concerns as TeachingPlan and LearningSessionPlan one and
 * two layers up.
 */
export interface OrchestratorDecision {
  action: OrchestratorAction;
  /** Set only when `action` is "skip" or a review point is being raised this turn — which topic it concerns. */
  reviewPointTopic: string | null;
  /** Which step of the originating LearningSessionPlan this decision concerns. */
  stepIndex: number;
  reason: string;
  /** Carried forward and persisted (src/ai/data's ConversationRepository) so the next turn resumes correctly. */
  nextState: OrchestratorRuntimeState;
  basedOn: OrchestratorEvidenceRef[];
  openQuestions: OrchestratorDecisionOpenQuestion[];
}

export interface OrchestratorInput {
  sessionPlan: LearningSessionPlan;
  state: OrchestratorRuntimeState;
  conversation: ConversationTurn[];
  /** Absent until a real turn-classifier exists — see TurnSignal's doc comment. */
  lastTurnSignal?: TurnSignal | null;
  /** Optional: lets `skip` react to freshly-computed mastery instead of only the plan's static snapshot — see orchestrator.ts's structural skip check. */
  learnerState?: LearnerState | null;
}
