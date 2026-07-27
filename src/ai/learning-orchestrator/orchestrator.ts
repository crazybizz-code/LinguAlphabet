import type { OrchestratorRuntimeState } from "@/ai/data";
import type { LearningSessionPlan } from "@/ai/learning-session-engine";
import type { OrchestratorAction, OrchestratorDecision, OrchestratorDecisionOpenQuestion, OrchestratorEvidenceRef, OrchestratorInput, TurnSignal } from "./types";

type Steps = LearningSessionPlan["steps"];

function finishDecision(
  state: OrchestratorRuntimeState,
  reasonDetail: string,
  basedOn: OrchestratorEvidenceRef[] = [],
  openQuestions: OrchestratorDecisionOpenQuestion[] = [],
  reviewPointTopic: string | null = null,
): OrchestratorDecision {
  return {
    action: "finish",
    reviewPointTopic,
    stepIndex: state.currentStepIndex,
    reason: `Finishing session — ${reasonDetail}.`,
    nextState: state,
    basedOn,
    openQuestions,
  };
}

function buildAdvanceDecision(
  action: "skip" | "celebrate",
  reviewPointTopic: string | null,
  state: OrchestratorRuntimeState,
  reviewPointsRaised: number[],
  basedOn: OrchestratorEvidenceRef[],
  openQuestions: OrchestratorDecisionOpenQuestion[],
): OrchestratorDecision {
  const nextState: OrchestratorRuntimeState = {
    currentStepIndex: state.currentStepIndex + 1,
    exchangesOnCurrentStep: 0,
    reviewPointsRaised,
  };
  return {
    action,
    reviewPointTopic,
    stepIndex: state.currentStepIndex,
    reason:
      action === "skip"
        ? `Skipping the review step for "${reviewPointTopic}" — the learner's current state no longer needs it.`
        : `Celebrating completion of step ${state.currentStepIndex}.`,
    nextState,
    basedOn,
    openQuestions,
  };
}

/**
 * Maps a TurnSignal (src/ai/turn-classifier) to a judgment-gated action,
 * or null when the outcome should fall through to structural pacing
 * instead: "understood" needs no intervention, "curiosity" is a positive
 * signal the LLM can already follow through wording alone, and
 * "off_topic" is handled by the prompt's own refusal policy, not a lesson
 * control action.
 *
 * "confused" and "frustration" each have two tiers so a struggling
 * learner isn't stuck repeating the exact same intervention forever: a
 * first "confused" gets a hint, a second gets escalated to a direct
 * explanation. "frustration" skips the hint tier and goes straight to
 * simplifying — Educational Priorities ranks the learner's confidence and
 * willingness to keep going above correctness, so a frustrated learner
 * gets immediate relief rather than another nudge; a second frustrated
 * turn escalates the same as confusion does.
 */
function applyTurnSignal(signal: TurnSignal, state: OrchestratorRuntimeState): OrchestratorAction | null {
  switch (signal.outcome) {
    case "requested_hint":
      return "give-hint";
    case "confused":
      return state.exchangesOnCurrentStep === 0 ? "give-hint" : "escalate";
    case "frustration":
      return state.exchangesOnCurrentStep === 0 ? "simplify" : "escalate";
    case "needs_review":
      return "repeat";
    case "mastered":
      return "celebrate";
    case "understood":
    case "curiosity":
    case "off_topic":
      return null;
  }
}

/**
 * Below this, a TurnSignal is treated the same as no signal at all — the
 * classifier's own self-reported uncertainty (src/ai/turn-classifier) is
 * too weak to justify a strong pedagogical action (repeat/simplify/hint/
 * escalate/celebrate). This is not a tuned ML threshold, just the line
 * between "more likely than not" and "a guess" — a signal the classifier
 * itself isn't confident in must never be treated as a fact about the
 * learner.
 */
const MIN_TURN_SIGNAL_CONFIDENCE = 0.5;

function findUnraisedReviewPoint(sessionPlan: LearningSessionPlan, state: OrchestratorRuntimeState): { topic: string; index: number } | null {
  for (let index = 0; index < sessionPlan.reviewPoints.length; index++) {
    const point = sessionPlan.reviewPoints[index];
    if (point.afterStepIndex === state.currentStepIndex - 1 && !state.reviewPointsRaised.includes(index)) {
      return { topic: point.topic, index };
    }
  }
  return null;
}

/**
 * The Learning Orchestrator (Phase 7) — manages the *live* lesson turn by
 * turn, given the static LearningSessionPlan the Learning Session Engine
 * already produced. Pure and deterministic wherever the input allows it;
 * the one place it isn't is interpreting what the learner's last message
 * actually meant (TurnSignal, Phase 8's src/ai/turn-classifier) — that
 * module perceives, this one decides, never the reverse. When no
 * TurnSignal is supplied, or its self-reported confidence is below
 * MIN_TURN_SIGNAL_CONFIDENCE, judgment-gated actions (repeat/simplify/
 * give-hint/escalate/celebrate) are honestly reported as open questions
 * instead of guessed — a low-confidence classification is never treated
 * as fact about the learner.
 *
 * Decision precedence, all deterministic except the TurnSignal branch:
 *   1. finish — already past the plan's last step.
 *   2. skip — current step is a stale review whose topic no longer
 *      appears in a freshly-computed LearnerState.
 *   3. celebrate / finish — current step is a celebration step.
 *   4. judgment-gated action, only if a sufficiently confident TurnSignal was supplied for the
 *      learner's latest turn (see applyTurnSignal()).
 *   5. continue — structural pacing against the step's exchange budget,
 *      advancing to the next step (or finishing) once it's used up.
 *
 * A review point due after the current step is surfaced (reviewPointTopic)
 * independently of which action above fires, so the LLM always gets told
 * to weave it in as soon as it's due.
 */
export function orchestrateSession(input: OrchestratorInput): OrchestratorDecision {
  const { sessionPlan, state, conversation, lastTurnSignal, learnerState } = input;
  const steps: Steps = sessionPlan.steps;
  const basedOn: OrchestratorEvidenceRef[] = [];
  const openQuestions: OrchestratorDecisionOpenQuestion[] = [];

  if (state.currentStepIndex >= steps.length) {
    return finishDecision(state, "already past the last planned step");
  }

  const currentStep = steps[state.currentStepIndex];
  const isFirstVisit = state.exchangesOnCurrentStep === 0;

  // Computed before the skip/celebration checks below so a due review
  // point is never missed just because this turn also skips or
  // celebrates — surfacing it is independent of which action fires.
  const dueReviewPoint = findUnraisedReviewPoint(sessionPlan, state);
  const reviewPointTopic = dueReviewPoint?.topic ?? null;
  const reviewPointsRaised = dueReviewPoint ? [...state.reviewPointsRaised, dueReviewPoint.index] : state.reviewPointsRaised;
  if (dueReviewPoint) {
    basedOn.push({ field: "sessionPlan.reviewPoints", detail: `raising "${dueReviewPoint.topic}" review point due after step ${sessionPlan.reviewPoints[dueReviewPoint.index].afterStepIndex}` });
  }

  if (isFirstVisit && currentStep.type === "review" && currentStep.topic && learnerState) {
    const stillNeedsReview = learnerState.reviewCandidates.some((record) => record.topic === currentStep.topic);
    if (!stillNeedsReview) {
      const skipEvidence: OrchestratorEvidenceRef[] = [
        ...basedOn,
        { field: "learnerState.reviewCandidates", detail: `"${currentStep.topic}" is no longer a review candidate` },
      ];
      const nextIndex = state.currentStepIndex + 1;
      if (nextIndex >= steps.length) {
        return finishDecision(
          { currentStepIndex: nextIndex, exchangesOnCurrentStep: 0, reviewPointsRaised },
          `the review step for "${currentStep.topic}" was skipped and it was the plan's last step`,
          skipEvidence,
          [],
          currentStep.topic,
        );
      }
      return buildAdvanceDecision("skip", currentStep.topic, state, reviewPointsRaised, skipEvidence, []);
    }
  }

  if (currentStep.type === "celebration") {
    const isLastStep = state.currentStepIndex >= steps.length - 1;
    const celebrationEvidence: OrchestratorEvidenceRef[] = [...basedOn, { field: "sessionPlan.steps[currentStepIndex].type", detail: "celebration" }];
    if (isLastStep) {
      return finishDecision(
        { currentStepIndex: state.currentStepIndex, exchangesOnCurrentStep: state.exchangesOnCurrentStep, reviewPointsRaised },
        "celebration step reached and it is the plan's final step",
        celebrationEvidence,
        [],
        reviewPointTopic,
      );
    }
    return buildAdvanceDecision("celebrate", reviewPointTopic, state, reviewPointsRaised, celebrationEvidence, []);
  }

  const lastTurn = conversation[conversation.length - 1];
  const hasLearnerTurn = lastTurn?.role === "user";

  if (hasLearnerTurn) {
    const confidentSignal = lastTurnSignal && lastTurnSignal.confidence >= MIN_TURN_SIGNAL_CONFIDENCE ? lastTurnSignal : null;

    if (confidentSignal) {
      const judged = applyTurnSignal(confidentSignal, state);
      if (judged) {
        const judgedBasedOn = [...basedOn, { field: "lastTurnSignal", detail: `outcome "${confidentSignal.outcome}" (confidence ${confidentSignal.confidence})` }];

        // A spontaneously "mastered" turn celebrates and moves on, same
        // as reaching a celebration step structurally — mastery doesn't
        // depend on the current step's own type.
        if (judged === "celebrate") {
          const isLastStep = state.currentStepIndex >= steps.length - 1;
          if (isLastStep) {
            return finishDecision(state, "learner's last turn showed mastery and this is the plan's final step", judgedBasedOn, openQuestions, reviewPointTopic);
          }
          return buildAdvanceDecision("celebrate", reviewPointTopic, state, reviewPointsRaised, judgedBasedOn, openQuestions);
        }

        const resetsStep = judged === "simplify" || judged === "escalate";
        return {
          action: judged,
          reviewPointTopic,
          stepIndex: state.currentStepIndex,
          reason: `Learner's last turn was judged "${confidentSignal.outcome}" — ${judged === "give-hint" ? "offering a hint" : judged === "repeat" ? "repeating the current step" : judged === "simplify" ? "simplifying the step" : "escalating for support"}.`,
          nextState: {
            currentStepIndex: state.currentStepIndex,
            exchangesOnCurrentStep: resetsStep ? 0 : state.exchangesOnCurrentStep + 1,
            reviewPointsRaised,
          },
          basedOn: judgedBasedOn,
          openQuestions,
        };
      }
    } else {
      const reason = lastTurnSignal
        ? `TurnSignal (src/ai/turn-classifier) for the learner's latest message was "${lastTurnSignal.outcome}" but at confidence ${lastTurnSignal.confidence}, below the ${MIN_TURN_SIGNAL_CONFIDENCE} threshold required to act on it as fact — cannot judge whether this response warrants intervention without interpreting its meaning.`
        : "No TurnSignal (src/ai/turn-classifier) was supplied for the learner's latest message — cannot judge whether this response warrants intervention without interpreting its meaning.";
      for (const action of ["repeat", "simplify", "give-hint", "escalate", "celebrate"] as const) {
        openQuestions.push({ action, reason });
      }
    }
  }

  const nextExchangeCount = state.exchangesOnCurrentStep + 1;
  const stepExhausted = nextExchangeCount >= currentStep.estimatedExchanges;

  if (!stepExhausted) {
    return {
      action: "continue",
      reviewPointTopic,
      stepIndex: state.currentStepIndex,
      reason: `Continuing step ${state.currentStepIndex} ("${currentStep.type}") — ${nextExchangeCount}/${currentStep.estimatedExchanges} exchanges used.`,
      nextState: { currentStepIndex: state.currentStepIndex, exchangesOnCurrentStep: nextExchangeCount, reviewPointsRaised },
      basedOn: [...basedOn, { field: "sessionPlan.steps[currentStepIndex].estimatedExchanges", detail: `${nextExchangeCount}/${currentStep.estimatedExchanges} used` }],
      openQuestions,
    };
  }

  const nextIndex = state.currentStepIndex + 1;
  const pacingEvidence = [...basedOn, { field: "sessionPlan.steps[currentStepIndex].estimatedExchanges", detail: `${nextExchangeCount}/${currentStep.estimatedExchanges} used — step complete` }];
  if (nextIndex >= steps.length) {
    return finishDecision(
      { currentStepIndex: nextIndex, exchangesOnCurrentStep: 0, reviewPointsRaised },
      "final step's exchange budget is exhausted",
      pacingEvidence,
      openQuestions,
      reviewPointTopic,
    );
  }
  return {
    action: "continue",
    reviewPointTopic,
    stepIndex: nextIndex,
    reason: `Step ${state.currentStepIndex} complete — advancing to step ${nextIndex} ("${steps[nextIndex].type}").`,
    nextState: { currentStepIndex: nextIndex, exchangesOnCurrentStep: 0, reviewPointsRaised },
    basedOn: pacingEvidence,
    openQuestions,
  };
}
