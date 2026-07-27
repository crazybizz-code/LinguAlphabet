import type { TeachingPlan } from "@/ai/coach-planner";

/**
 * Renders the Coach Planner's decision (src/ai/coach-planner) — what to
 * teach next and how, decided deterministically before this prompt was
 * ever built. This is instruction, not information: TEACHING_PLAN_USAGE
 * (./sections.ts) is what tells the model to follow it rather than
 * re-derive it; this function only renders the plan's own fields.
 */
export function buildTeachingPlanBlock(plan?: TeachingPlan | null): string | null {
  if (!plan) return null;

  const lines: string[] = [
    `Goal: ${plan.goal}`,
    `Strategy: ${plan.strategy}`,
    `Teaching style: ${plan.teachingStyle}`,
    `Conversation mode: ${plan.conversationMode}`,
  ];

  if (plan.priorityTopic) lines.push(`Priority topic: ${plan.priorityTopic}`);
  if (plan.recommendedDifficulty) lines.push(`Calibrate to: ${plan.recommendedDifficulty}`);
  if (plan.shouldProactivelyIntervene && plan.interventionReason) lines.push(`Proactive nudge warranted: ${plan.interventionReason}`);
  if (plan.nextLearningOpportunity) lines.push(`Next learning opportunity: ${plan.nextLearningOpportunity}`);

  return lines.join("\n");
}
