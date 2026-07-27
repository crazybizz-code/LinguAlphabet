import type { LearningSessionPlan } from "@/ai/learning-session-engine";

/**
 * Renders the Learning Session Engine's plan (src/ai/learning-session-engine)
 * — the structure underneath the Teaching Plan's strategy. This is
 * instruction, not information, same as ./teaching-plan-block.ts:
 * SESSION_PLAN_USAGE (./sections.ts) is what tells the model to follow
 * it rather than invent its own flow; this function only renders the
 * plan's own fields, in step order.
 */
export function buildSessionPlanBlock(plan?: LearningSessionPlan | null): string | null {
  if (!plan) return null;

  const lines: string[] = [`Session goal: ${plan.sessionGoal}`, `Estimated length: ${plan.estimatedDuration}`, `Success looks like: ${plan.successCriteria}`, "Steps:"];

  plan.steps.forEach((step, index) => {
    const topicSuffix = step.topic ? ` (${step.topic})` : "";
    lines.push(`  ${index + 1}. ${step.type}${topicSuffix} — ${step.goal}`);

    const reviewsHere = plan.reviewPoints.filter((point) => point.afterStepIndex === index);
    for (const review of reviewsHere) {
      lines.push(`     → bring up a review of "${review.topic}" around here: ${review.reason}`);
    }
  });

  lines.push(`When the session wraps up: ${plan.completionBehavior}.`);

  return lines.join("\n");
}
