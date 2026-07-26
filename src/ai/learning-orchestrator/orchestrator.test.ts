import { describe, it, expect } from "vitest";
import { orchestrateSession } from "./orchestrator";
import { INITIAL_ORCHESTRATOR_STATE } from "@/ai/data";
import type { OrchestratorRuntimeState } from "@/ai/data";
import type { LearningSessionPlan } from "@/ai/learning-session-engine";
import type { LearnerState, TopicMasteryRecord } from "@/ai/learning-engine";
import type { ConversationTurn, TurnSignal } from "./types";

const sessionPlan: LearningSessionPlan = {
  sessionGoal: "Reinforce reported speech.",
  estimatedDuration: "5-8 minutes",
  steps: [
    { type: "warm-up", topic: null, goal: "Greet the learner and set context.", estimatedExchanges: 1 },
    { type: "review", topic: "past-simple", goal: "Check retention of past-simple.", estimatedExchanges: 2 },
    { type: "guided-practice", topic: "reported-speech", goal: "Practice reported speech with support.", estimatedExchanges: 2 },
    { type: "celebration", topic: null, goal: "Celebrate progress.", estimatedExchanges: 1 },
  ],
  reviewPoints: [{ topic: "reported-speech", reason: "Recent quiz misses on this topic.", afterStepIndex: 2 }],
  successCriteria: "Learner correctly reports at least two statements.",
  completionBehavior: "celebrate-and-continue",
  basedOn: [],
};

const noCelebrationPlan: LearningSessionPlan = {
  ...sessionPlan,
  steps: [
    { type: "warm-up", topic: null, goal: "Greet the learner.", estimatedExchanges: 1 },
    { type: "reflection", topic: null, goal: "Reflect on the session.", estimatedExchanges: 1 },
  ],
  reviewPoints: [],
};

function mastery(topic: string): TopicMasteryRecord {
  return { topic, skill: "grammar", status: "weak", confidence: 0.4, evidenceCount: 2, lastEvidenceAt: new Date().toISOString() };
}

const learnerState: LearnerState = {
  learnerId: "learner-1",
  computedAt: new Date().toISOString(),
  topicMastery: [],
  grammarMastery: [],
  vocabularyMastery: [],
  recentlyStudiedTopics: [],
  reviewCandidates: [mastery("past-simple")],
  momentum: { recentSessionCount: 0, trend: "insufficient-data" },
  openQuestions: [],
};

const userTurn: ConversationTurn[] = [
  { role: "assistant", content: "Can you tell me what she said?" },
  { role: "user", content: "She said that she was tired." },
];

describe("orchestrateSession — structural pacing", () => {
  it("continues on the same step while its exchange budget isn't used up", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 2, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: [] });

    expect(decision.action).toBe("continue");
    expect(decision.nextState).toEqual({ currentStepIndex: 2, exchangesOnCurrentStep: 1, reviewPointsRaised: [0] });
  });

  it("advances to the next step once the current step's exchange budget is exhausted", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 2, exchangesOnCurrentStep: 1, reviewPointsRaised: [0] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: [] });

    expect(decision.action).toBe("continue");
    expect(decision.stepIndex).toBe(3);
    expect(decision.nextState).toEqual({ currentStepIndex: 3, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] });
  });

  it("finishes when the plan's final (non-celebration) step is exhausted", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 1, exchangesOnCurrentStep: 0, reviewPointsRaised: [] };
    const decision = orchestrateSession({ sessionPlan: noCelebrationPlan, state, conversation: [] });

    expect(decision.action).toBe("finish");
    expect(decision.nextState.currentStepIndex).toBe(2);
  });

  it("finishes immediately when already past the last step", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 4, exchangesOnCurrentStep: 0, reviewPointsRaised: [] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: [] });
    expect(decision.action).toBe("finish");
  });
});

describe("orchestrateSession — celebration steps", () => {
  it("celebrates and advances when a celebration step isn't the last one", () => {
    const plan: LearningSessionPlan = { ...sessionPlan, steps: [...sessionPlan.steps, { type: "reflection", topic: null, goal: "Wrap up.", estimatedExchanges: 1 }] };
    const state: OrchestratorRuntimeState = { currentStepIndex: 3, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] };
    const decision = orchestrateSession({ sessionPlan: plan, state, conversation: [] });

    expect(decision.action).toBe("celebrate");
    expect(decision.nextState).toEqual({ currentStepIndex: 4, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] });
  });

  it("finishes when the celebration step is the plan's last step", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 3, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: [] });
    expect(decision.action).toBe("finish");
  });
});

describe("orchestrateSession — review point surfacing", () => {
  it("surfaces an unraised review point due after the current step index", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 3, exchangesOnCurrentStep: 0, reviewPointsRaised: [] };
    const plan: LearningSessionPlan = { ...sessionPlan, steps: [...sessionPlan.steps, { type: "reflection", topic: null, goal: "Wrap up.", estimatedExchanges: 1 }] };
    const decision = orchestrateSession({ sessionPlan: plan, state, conversation: [] });

    expect(decision.reviewPointTopic).toBe("reported-speech");
    expect(decision.nextState.reviewPointsRaised).toEqual([0]);
  });

  it("never raises the same review point twice", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 3, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: [] });
    expect(decision.reviewPointTopic).toBeNull();
  });
});

describe("orchestrateSession — skipping stale review steps", () => {
  it("skips a review step whose topic is no longer a review candidate", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 1, exchangesOnCurrentStep: 0, reviewPointsRaised: [] };
    const staleLearnerState: LearnerState = { ...learnerState, reviewCandidates: [] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: [], learnerState: staleLearnerState });

    expect(decision.action).toBe("skip");
    expect(decision.reviewPointTopic).toBe("past-simple");
    expect(decision.nextState.currentStepIndex).toBe(2);
  });

  it("does not skip when the topic is still a genuine review candidate", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 1, exchangesOnCurrentStep: 0, reviewPointsRaised: [] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: [], learnerState });

    expect(decision.action).toBe("continue");
    expect(decision.stepIndex).toBe(1);
  });

  it("does not re-check skip logic after the first exchange on the step", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 1, exchangesOnCurrentStep: 1, reviewPointsRaised: [] };
    const staleLearnerState: LearnerState = { ...learnerState, reviewCandidates: [] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: [], learnerState: staleLearnerState });

    expect(decision.action).not.toBe("skip");
  });
});

describe("orchestrateSession — judgment-gated actions (TurnSignal supplied)", () => {
  it("gives a hint when the learner explicitly asks for help", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 2, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] };
    const signal: TurnSignal = { outcome: "help-requested", confidence: 0.9 };
    const decision = orchestrateSession({ sessionPlan, state, conversation: userTurn, lastTurnSignal: signal });
    expect(decision.action).toBe("give-hint");
  });

  it("repeats on a first incorrect answer, then simplifies on a second", () => {
    const firstState: OrchestratorRuntimeState = { currentStepIndex: 2, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] };
    const signal: TurnSignal = { outcome: "incorrect", confidence: 0.8 };
    const first = orchestrateSession({ sessionPlan, state: firstState, conversation: userTurn, lastTurnSignal: signal });
    expect(first.action).toBe("repeat");

    const secondState: OrchestratorRuntimeState = { currentStepIndex: 2, exchangesOnCurrentStep: 1, reviewPointsRaised: [0] };
    const second = orchestrateSession({ sessionPlan, state: secondState, conversation: userTurn, lastTurnSignal: signal });
    expect(second.action).toBe("simplify");
    expect(second.nextState.exchangesOnCurrentStep).toBe(0);
  });

  it("gives a hint on first confusion, then escalates on continued confusion", () => {
    const signal: TurnSignal = { outcome: "confused", confidence: 0.7 };
    const first = orchestrateSession({
      sessionPlan,
      state: { currentStepIndex: 2, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] },
      conversation: userTurn,
      lastTurnSignal: signal,
    });
    expect(first.action).toBe("give-hint");

    const second = orchestrateSession({
      sessionPlan,
      state: { currentStepIndex: 2, exchangesOnCurrentStep: 1, reviewPointsRaised: [0] },
      conversation: userTurn,
      lastTurnSignal: signal,
    });
    expect(second.action).toBe("escalate");
  });

  it("falls through to structural pacing when the outcome is correct", () => {
    const signal: TurnSignal = { outcome: "correct", confidence: 0.95 };
    const state: OrchestratorRuntimeState = { currentStepIndex: 2, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: userTurn, lastTurnSignal: signal });
    expect(decision.action).toBe("continue");
  });
});

describe("orchestrateSession — honest gaps when judgment can't be made", () => {
  it("raises openQuestions for every judgment-gated action when a learner turn exists but no TurnSignal was supplied", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 2, exchangesOnCurrentStep: 0, reviewPointsRaised: [0] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: userTurn });

    expect(decision.action).toBe("continue");
    expect(decision.openQuestions.map((question) => question.action).sort()).toEqual(["escalate", "give-hint", "repeat", "simplify"]);
  });

  it("raises no openQuestions when there is no learner turn yet to interpret", () => {
    const state: OrchestratorRuntimeState = { currentStepIndex: 0, exchangesOnCurrentStep: 0, reviewPointsRaised: [] };
    const decision = orchestrateSession({ sessionPlan, state, conversation: [{ role: "assistant", content: "Hi! Ready to practice?" }] });
    expect(decision.openQuestions).toEqual([]);
  });
});

describe("orchestrateSession — evidence traceability", () => {
  it("always includes at least one basedOn entry explaining the decision", () => {
    const state = INITIAL_ORCHESTRATOR_STATE;
    const decision = orchestrateSession({ sessionPlan, state, conversation: [] });
    expect(decision.basedOn.length).toBeGreaterThan(0);
  });
});
