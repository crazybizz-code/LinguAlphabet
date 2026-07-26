import { describe, it, expect } from "vitest";
import { buildTutoSystemPrompt } from "./index";
import { planLearningSession } from "@/ai/learning-session-engine";
import { orchestrateSession } from "@/ai/learning-orchestrator";
import { INITIAL_ORCHESTRATOR_STATE } from "@/ai/data";
import type { TeachingPlan } from "@/ai/coach-planner";
import type { LearnerState } from "@/ai/learning-engine";
import { buildLearningContext } from "@/ai/context";

const teachingPlan: TeachingPlan = {
  goal: "Reinforce reported-speech before introducing new grammar.",
  strategy: "reinforce-weak-topic",
  priorityTopic: "reported-speech",
  recommendedDifficulty: "B1",
  teachingStyle: "guided-discovery",
  shouldProactivelyIntervene: true,
  interventionReason: "2 recent quiz answers came back incorrect.",
  conversationMode: "focused-practice",
  nextLearningOpportunity: null,
  basedOn: [],
};

const learnerState: LearnerState = {
  learnerId: "learner-1",
  computedAt: new Date().toISOString(),
  topicMastery: [],
  grammarMastery: [],
  vocabularyMastery: [],
  recentlyStudiedTopics: [],
  reviewCandidates: [],
  momentum: { recentSessionCount: 0, trend: "insufficient-data" },
  openQuestions: [],
};

describe("buildTutoSystemPrompt — Learning Session Plan wiring (Phase 6)", () => {
  it("includes the session structure section when a sessionPlan is supplied", () => {
    const learningContext = buildLearningContext({ userLevel: "B1" });
    const sessionPlan = planLearningSession({ teachingPlan, learnerState, learningContext });

    const prompt = buildTutoSystemPrompt({ learningContext, teachingPlan, learnerState, sessionPlan });

    expect(prompt).toContain("# Session plan guidance");
    expect(prompt).toContain("# Today's session structure");
    expect(prompt).toContain(sessionPlan.sessionGoal);
    expect(prompt).toContain("1. warm-up");
    expect(prompt).toContain(sessionPlan.completionBehavior);
  });

  it("omits the session structure section entirely when no sessionPlan is supplied", () => {
    const prompt = buildTutoSystemPrompt({ learningContext: buildLearningContext({}) });
    expect(prompt).not.toContain("# Today's session structure");
    // Guidance section is always present (static instructions), only the rendered data block is conditional.
    expect(prompt).toContain("# Session plan guidance");
  });
});

describe("buildTutoSystemPrompt — Orchestrator decision wiring (Phase 7)", () => {
  it("includes the live decision section when an orchestratorDecision is supplied", () => {
    const learningContext = buildLearningContext({ userLevel: "B1" });
    const sessionPlan = planLearningSession({ teachingPlan, learnerState, learningContext });
    const decision = orchestrateSession({ sessionPlan, state: INITIAL_ORCHESTRATOR_STATE, conversation: [] });

    const prompt = buildTutoSystemPrompt({ learningContext, teachingPlan, learnerState, sessionPlan, orchestratorDecision: decision });

    expect(prompt).toContain("# Orchestrator decision guidance");
    expect(prompt).toContain("# Right now, in this turn");
  });

  it("omits the live decision section entirely when no orchestratorDecision is supplied", () => {
    const prompt = buildTutoSystemPrompt({ learningContext: buildLearningContext({}) });
    expect(prompt).not.toContain("# Right now, in this turn");
    expect(prompt).toContain("# Orchestrator decision guidance");
  });
});
