import type { CefrLevel } from "@/ai/context";
import type { LearnerState, LearnerMomentum } from "@/ai/learning-engine";
import type { TeachingPlan, TeachingStrategy } from "@/ai/coach-planner";
import type { SessionEngineInput, LearningSessionPlan, LearningSessionStep, SessionStepType, SessionReviewPoint, CompletionBehavior } from "./types";

/** A1/A2 gets a lighter exchange budget per step — shorter attention spans at the earliest levels, the same calibration ACTIVE_LEARNING's prompt text and Coach Planner's teachingStyle already apply, now applied to pacing too. */
function pacingMultiplier(userLevel: CefrLevel | null): number {
  return userLevel === "A1" || userLevel === "A2" ? 0.75 : 1;
}

function scaleExchanges(base: number, multiplier: number): number {
  return Math.max(1, Math.round(base * multiplier));
}

function estimateDurationLabel(totalExchanges: number): string {
  if (totalExchanges <= 4) return "3-5 minutes";
  if (totalExchanges <= 7) return "5-8 minutes";
  if (totalExchanges <= 10) return "8-12 minutes";
  return "12-15 minutes";
}

interface StepBlueprint {
  type: SessionStepType;
  usesTopic: boolean;
  goal: (topic: string | null) => string;
  baseExchanges: number;
}

/**
 * One deterministic step template per TeachingPlan.strategy — the actual
 * "lesson flow" decision. Ordered, pedagogically shaped: a weak topic
 * gets re-explained before it's practiced; a stale topic only needs a
 * light touch, not a full re-teach; a fresh conversation opens with
 * getting-to-know-you, not a lesson structure with nothing to hang it on.
 */
const STRATEGY_BLUEPRINTS: Record<TeachingStrategy, StepBlueprint[]> = {
  "reinforce-weak-topic": [
    { type: "warm-up", usesTopic: false, goal: () => "Ease in and signal continuity with last time.", baseExchanges: 1 },
    { type: "review", usesTopic: true, goal: (topic) => `Recall what's already been tried with ${topic ?? "this topic"}.`, baseExchanges: 1 },
    {
      type: "explanation",
      usesTopic: true,
      goal: (topic) => `Re-explain ${topic ?? "the topic"}, calibrated to the recommended teaching style.`,
      baseExchanges: 2,
    },
    { type: "guided-practice", usesTopic: true, goal: (topic) => `Practice ${topic ?? "the topic"} with support.`, baseExchanges: 3 },
    { type: "check-understanding", usesTopic: true, goal: (topic) => `Confirm the correction on ${topic ?? "the topic"} actually landed.`, baseExchanges: 1 },
    { type: "independent-practice", usesTopic: true, goal: (topic) => `Apply ${topic ?? "the topic"} without prompting.`, baseExchanges: 2 },
    { type: "reflection", usesTopic: false, goal: () => "Learner reflects on what changed.", baseExchanges: 1 },
  ],
  "review-stale-topic": [
    { type: "warm-up", usesTopic: false, goal: () => "Ease in.", baseExchanges: 1 },
    { type: "review", usesTopic: true, goal: (topic) => `Resurface ${topic ?? "the topic"} before it fades further.`, baseExchanges: 1 },
    {
      type: "check-understanding",
      usesTopic: true,
      goal: (topic) => `See whether ${topic ?? "the topic"} is still there without re-teaching it from scratch.`,
      baseExchanges: 1,
    },
    { type: "guided-practice", usesTopic: true, goal: (topic) => `A light refresh on ${topic ?? "the topic"}.`, baseExchanges: 1 },
    {
      type: "celebration",
      usesTopic: false,
      goal: () => "Acknowledge it's holding up — or gently note it needs another look, without alarm.",
      baseExchanges: 1,
    },
  ],
  "introduce-new-topic": [
    { type: "warm-up", usesTopic: false, goal: () => "Ease in.", baseExchanges: 1 },
    {
      type: "explanation",
      usesTopic: false,
      goal: () => "Introduce something new, following the learner's own curiosity or a natural next step.",
      baseExchanges: 2,
    },
    { type: "guided-practice", usesTopic: false, goal: () => "Practice the new idea with support.", baseExchanges: 2 },
    { type: "check-understanding", usesTopic: false, goal: () => "Confirm it landed before moving on.", baseExchanges: 1 },
    { type: "reflection", usesTopic: false, goal: () => "Learner connects it to something they already know.", baseExchanges: 1 },
  ],
  "maintain-momentum": [
    { type: "warm-up", usesTopic: false, goal: () => "Acknowledge the gap warmly — no guilt, no scolding.", baseExchanges: 1 },
    { type: "independent-practice", usesTopic: false, goal: () => "Something easy and rewarding to rebuild momentum.", baseExchanges: 2 },
    { type: "celebration", usesTopic: false, goal: () => "Celebrate showing up today specifically, not a generic streak number.", baseExchanges: 1 },
  ],
  "insufficient-data": [
    { type: "warm-up", usesTopic: false, goal: () => "Get acquainted.", baseExchanges: 1 },
    { type: "explanation", usesTopic: false, goal: () => "Learn about the learner's level and interests through conversation, not a quiz.", baseExchanges: 2 },
    { type: "reflection", usesTopic: false, goal: () => "Learner shares what they'd like to work on.", baseExchanges: 1 },
  ],
};

function buildSteps(blueprints: StepBlueprint[], topic: string | null, multiplier: number): LearningSessionStep[] {
  return blueprints.map((blueprint) => ({
    type: blueprint.type,
    topic: blueprint.usesTopic ? topic : null,
    goal: blueprint.goal(blueprint.usesTopic ? topic : null),
    estimatedExchanges: scaleExchanges(blueprint.baseExchanges, multiplier),
  }));
}

const MAX_REVIEW_POINTS = 2;

/** Reviews interrupt practice, not the opening or the close — prefer inserting right where a learner is already doing active work. */
function pickReviewInsertionIndex(steps: LearningSessionStep[]): number {
  const practiceIndex = steps.findIndex((step) => step.type === "guided-practice" || step.type === "independent-practice");
  if (practiceIndex !== -1) return practiceIndex;
  return Math.max(0, steps.length - 2);
}

/**
 * Review timing, grounded directly in LearnerState.reviewCandidates — the
 * Learning Engine's own forgetting-risk output (src/ai/learning-engine),
 * never re-derived here. Excludes whatever topic the session's main
 * strategy is already built around, so the same topic never gets listed
 * twice in one plan for two different reasons.
 */
function buildReviewPoints(learnerState: LearnerState, teachingPlan: TeachingPlan, steps: LearningSessionStep[]): SessionReviewPoint[] {
  if (steps.length === 0) return [];
  const insertionIndex = pickReviewInsertionIndex(steps);

  return learnerState.reviewCandidates
    .filter((record) => record.topic !== teachingPlan.priorityTopic)
    .slice(0, MAX_REVIEW_POINTS)
    .map((record) => ({
      topic: record.topic,
      reason: `No new evidence on "${record.topic}" since ${record.lastEvidenceAt} — worth a light touch before it fades further.`,
      afterStepIndex: insertionIndex,
    }));
}

function buildSuccessCriteria(strategy: TeachingStrategy, topic: string | null): string {
  switch (strategy) {
    case "reinforce-weak-topic":
      return `The learner can correctly use ${topic ?? "the topic"} in at least one new sentence without help.`;
    case "review-stale-topic":
      return `The learner recognizes ${topic ?? "the topic"} without hesitation.`;
    case "introduce-new-topic":
      return "The learner engages with at least one new idea and can restate it in their own words.";
    case "maintain-momentum":
      return "The learner completes the session having re-engaged, however briefly.";
    case "insufficient-data":
      return "Tuto learns at least one concrete fact about this learner's level, goal, or interests.";
  }
}

/**
 * Longer sessions earn a suggested break rather than pushing straight
 * through; re-engagement after a momentum dip is always the biggest
 * moment regardless of length (matches the product's existing
 * "restoring momentum" framing — the single most important tone moment,
 * never treated as routine); a light review or a first conversation
 * closes quietly, since neither is the kind of moment that calls for a
 * celebration.
 */
function pickCompletionBehavior(strategy: TeachingStrategy, totalExchanges: number): CompletionBehavior {
  if (strategy === "maintain-momentum") return "celebrate-milestone";
  if (strategy === "review-stale-topic" || strategy === "insufficient-data") return "quiet-continue";
  if (totalExchanges >= 10) return "celebrate-and-suggest-break";
  return "celebrate-and-continue";
}

function describeMomentum(momentum: LearnerMomentum): string {
  return `trend=${momentum.trend}, recentSessionCount=${momentum.recentSessionCount}`;
}

/**
 * TeachingPlan → Learning Session Plan (Phase 6). Pure and deterministic,
 * the same contract as src/ai/learning-engine's computeLearnerState() and
 * src/ai/coach-planner's planTeaching(): no I/O, no model call, same
 * input always produces the same output. This is the only place lesson
 * flow, pacing, exercise order, review timing, reflection points, and
 * celebration moments get decided — the LLM enacts the result, it never
 * invents session structure.
 *
 * "Remain deterministic whenever possible": every decision this phase
 * makes is deterministic — strategy selects a step template, CEFR level
 * scales pacing, LearnerState.reviewCandidates places review points,
 * momentum and session length select completionBehavior. The one thing
 * deliberately left to the LLM is everything this module was never asked
 * to decide: the exact wording of an explanation, the specific question
 * to ask in the moment, how to phrase a celebration — those require
 * judgment about the live conversation this function has no access to
 * (and shouldn't: it runs once, before the turn, not turn by turn). That
 * split is the same one TeachingPlan already drew between strategy
 * (decided here) and delivery (the LLM's job) — this module just applies
 * it one layer more concretely, to structure instead of strategy.
 */
export function planLearningSession(input: SessionEngineInput): LearningSessionPlan {
  const { teachingPlan, learnerState, learningContext } = input;

  const multiplier = pacingMultiplier(learningContext.userLevel);
  const blueprint = STRATEGY_BLUEPRINTS[teachingPlan.strategy];
  const steps = buildSteps(blueprint, teachingPlan.priorityTopic, multiplier);
  const totalExchanges = steps.reduce((sum, step) => sum + step.estimatedExchanges, 0);

  return {
    sessionGoal: teachingPlan.goal,
    estimatedDuration: estimateDurationLabel(totalExchanges),
    steps,
    reviewPoints: buildReviewPoints(learnerState, teachingPlan, steps),
    successCriteria: buildSuccessCriteria(teachingPlan.strategy, teachingPlan.priorityTopic),
    completionBehavior: pickCompletionBehavior(teachingPlan.strategy, totalExchanges),
    basedOn: [
      { field: "teachingPlan.strategy", detail: teachingPlan.strategy },
      { field: "teachingPlan.priorityTopic", detail: teachingPlan.priorityTopic ?? "none" },
      { field: "learningContext.userLevel", detail: learningContext.userLevel ?? "unset — default pacing applied" },
      { field: "learnerState.momentum", detail: describeMomentum(learnerState.momentum) },
      { field: "learnerState.reviewCandidates", detail: `${learnerState.reviewCandidates.length} candidate(s) considered` },
    ],
  };
}
