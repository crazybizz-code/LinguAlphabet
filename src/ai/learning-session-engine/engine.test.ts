import { describe, it, expect } from "vitest";
import { planLearningSession } from "./engine";
import type { SessionEngineInput } from "./types";
import type { TeachingPlan } from "@/ai/coach-planner";
import type { LearnerState } from "@/ai/learning-engine";
import { buildLearningContext } from "@/ai/context";

function teachingPlan(overrides: Partial<TeachingPlan> = {}): TeachingPlan {
  return {
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
    ...overrides,
  };
}

function learnerState(overrides: Partial<LearnerState> = {}): LearnerState {
  return {
    learnerId: "learner-1",
    computedAt: new Date().toISOString(),
    topicMastery: [],
    grammarMastery: [],
    vocabularyMastery: [],
    recentlyStudiedTopics: [],
    reviewCandidates: [],
    momentum: { recentSessionCount: 0, trend: "insufficient-data" },
    openQuestions: [],
    ...overrides,
  };
}

describe("planLearningSession — deterministic contract", () => {
  it("produces the exact same plan for the exact same input", () => {
    const input: SessionEngineInput = { teachingPlan: teachingPlan(), learnerState: learnerState(), learningContext: buildLearningContext({ userLevel: "B1" }) };
    expect(planLearningSession(input)).toEqual(planLearningSession(input));
  });

  it("sessionGoal is always identical to the originating TeachingPlan.goal", () => {
    const plan = teachingPlan({ goal: "A distinctive goal string." });
    const result = planLearningSession({ teachingPlan: plan, learnerState: learnerState(), learningContext: buildLearningContext({}) });
    expect(result.sessionGoal).toBe("A distinctive goal string.");
  });
});

describe("planLearningSession — strategy shapes the flow", () => {
  it("reinforce-weak-topic builds a full re-teach flow: review, explanation, practice, then reflection", () => {
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "reinforce-weak-topic", priorityTopic: "reported-speech" }),
      learnerState: learnerState(),
      learningContext: buildLearningContext({ userLevel: "B1" }),
    });
    const types = result.steps.map((step) => step.type);
    expect(types).toEqual(["warm-up", "review", "explanation", "guided-practice", "check-understanding", "independent-practice", "reflection"]);
    expect(result.steps.every((step) => step.type === "warm-up" || step.type === "reflection" || step.topic === "reported-speech")).toBe(true);
  });

  it("review-stale-topic is shorter and ends on celebration, not reflection", () => {
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "review-stale-topic", priorityTopic: "past-simple" }),
      learnerState: learnerState(),
      learningContext: buildLearningContext({ userLevel: "B1" }),
    });
    expect(result.steps.at(-1)?.type).toBe("celebration");
    expect(result.steps.length).toBeLessThan(
      planLearningSession({
        teachingPlan: teachingPlan({ strategy: "reinforce-weak-topic" }),
        learnerState: learnerState(),
        learningContext: buildLearningContext({ userLevel: "B1" }),
      }).steps.length,
    );
  });

  it("maintain-momentum is the shortest flow and never carries a topic on any step", () => {
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "maintain-momentum", priorityTopic: null }),
      learnerState: learnerState({ momentum: { recentSessionCount: 1, trend: "decreasing" } }),
      learningContext: buildLearningContext({ userLevel: "B1" }),
    });
    expect(result.steps.every((step) => step.topic === null)).toBe(true);
    expect(result.steps.map((s) => s.type)).toEqual(["warm-up", "independent-practice", "celebration"]);
  });

  it("insufficient-data opens with getting-to-know-you, not a review or explanation of a specific topic", () => {
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "insufficient-data", priorityTopic: null }),
      learnerState: learnerState(),
      learningContext: buildLearningContext({}),
    });
    expect(result.steps.every((step) => step.topic === null)).toBe(true);
    expect(result.steps[0].type).toBe("warm-up");
  });
});

describe("planLearningSession — pacing", () => {
  it("gives A1/A2 learners a lighter exchange budget than B1+ for the identical strategy", () => {
    const base = { teachingPlan: teachingPlan({ strategy: "reinforce-weak-topic" }), learnerState: learnerState() };
    const a1 = planLearningSession({ ...base, learningContext: buildLearningContext({ userLevel: "A1" }) });
    const b1 = planLearningSession({ ...base, learningContext: buildLearningContext({ userLevel: "B1" }) });

    const a1Total = a1.steps.reduce((sum, step) => sum + step.estimatedExchanges, 0);
    const b1Total = b1.steps.reduce((sum, step) => sum + step.estimatedExchanges, 0);
    expect(a1Total).toBeLessThan(b1Total);
  });

  it("never produces a step with fewer than 1 estimated exchange", () => {
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "review-stale-topic" }),
      learnerState: learnerState(),
      learningContext: buildLearningContext({ userLevel: "A1" }),
    });
    expect(result.steps.every((step) => step.estimatedExchanges >= 1)).toBe(true);
  });
});

describe("planLearningSession — review points", () => {
  it("surfaces LearnerState.reviewCandidates as review points, excluding the session's own priority topic", () => {
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "reinforce-weak-topic", priorityTopic: "reported-speech" }),
      learnerState: learnerState({
        reviewCandidates: [
          { topic: "reported-speech", skill: "grammar", status: "weak", confidence: 0.5, evidenceCount: 2, lastEvidenceAt: new Date().toISOString() },
          { topic: "past-perfect", skill: "grammar", status: "developing", confidence: 0.3, evidenceCount: 1, lastEvidenceAt: new Date().toISOString() },
        ],
      }),
      learningContext: buildLearningContext({ userLevel: "B1" }),
    });

    expect(result.reviewPoints.some((point) => point.topic === "reported-speech")).toBe(false);
    expect(result.reviewPoints.some((point) => point.topic === "past-perfect")).toBe(true);
  });

  it("caps review points rather than listing every stale topic in one session", () => {
    const manyCandidates = Array.from({ length: 5 }, (_, index) => ({
      topic: `topic-${index}`,
      skill: "vocabulary" as const,
      status: "emerging" as const,
      confidence: 0.2,
      evidenceCount: 1,
      lastEvidenceAt: new Date().toISOString(),
    }));
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "introduce-new-topic", priorityTopic: null }),
      learnerState: learnerState({ reviewCandidates: manyCandidates }),
      learningContext: buildLearningContext({ userLevel: "B1" }),
    });
    expect(result.reviewPoints.length).toBeLessThanOrEqual(2);
  });

  it("never points a review at a step index that doesn't exist", () => {
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "maintain-momentum", priorityTopic: null }),
      learnerState: learnerState({
        reviewCandidates: [{ topic: "some-word", skill: "vocabulary", status: "emerging", confidence: 0.2, evidenceCount: 1, lastEvidenceAt: new Date().toISOString() }],
      }),
      learningContext: buildLearningContext({ userLevel: "B1" }),
    });
    for (const point of result.reviewPoints) {
      expect(point.afterStepIndex).toBeGreaterThanOrEqual(0);
      expect(point.afterStepIndex).toBeLessThan(result.steps.length);
    }
  });
});

describe("planLearningSession — completion behavior", () => {
  it("always celebrates a milestone on re-engagement, regardless of session length", () => {
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "maintain-momentum", priorityTopic: null }),
      learnerState: learnerState({ momentum: { recentSessionCount: 1, trend: "decreasing" } }),
      learningContext: buildLearningContext({ userLevel: "B1" }),
    });
    expect(result.completionBehavior).toBe("celebrate-milestone");
  });

  it("closes quietly on a stale-topic review", () => {
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "review-stale-topic", priorityTopic: "past-simple" }),
      learnerState: learnerState(),
      learningContext: buildLearningContext({ userLevel: "B1" }),
    });
    expect(result.completionBehavior).toBe("quiet-continue");
  });

  it("suggests a break for a long session rather than pushing straight through", () => {
    const result = planLearningSession({
      teachingPlan: teachingPlan({ strategy: "reinforce-weak-topic", priorityTopic: "reported-speech" }),
      learnerState: learnerState(),
      learningContext: buildLearningContext({ userLevel: "C1" }),
    });
    const totalExchanges = result.steps.reduce((sum, step) => sum + step.estimatedExchanges, 0);
    expect(totalExchanges).toBeGreaterThanOrEqual(10);
    expect(result.completionBehavior).toBe("celebrate-and-suggest-break");
  });
});
