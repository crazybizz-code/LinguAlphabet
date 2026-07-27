import type { LearningSessionPlan } from "@/ai/learning-session-engine";
import type { LearnerState } from "@/ai/learning-engine";
import type { OrchestratorRuntimeState } from "@/ai/data";
import type { TurnSignal } from "@/ai/turn-classifier";

export const ORCHESTRATOR_ACTIONS = ["continue", "repeat", "simplify", "give-hint", "celebrate", "skip", "escalate", "finish"] as const;
export type OrchestratorAction = (typeof ORCHESTRATOR_ACTIONS)[number];

export type { TurnSignal };

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
 * judgment-gated action (repeat/simplify/give-hint/escalate/celebrate)
 * would need a TurnSignal that wasn't supplied.
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
  /** The Turn Classifier's perception of the learner's latest message (Phase 8, src/ai/turn-classifier) — absent when there's no learner turn yet, or classification failed. See TurnSignal's own doc comment there. */
  lastTurnSignal?: TurnSignal | null;
  /** Optional: lets `skip` react to freshly-computed mastery instead of only the plan's static snapshot — see orchestrator.ts's structural skip check. */
  learnerState?: LearnerState | null;
}
