/**
 * Plan Adaptor — updates future plan tasks in response to practice/mock results.
 *
 * Rules:
 *   - Never touch completed tasks (completed = true)
 *   - Never touch tasks in the past (plan_date < today)
 *   - When weak areas are detected, swap eligible future tasks to weak_area type
 *   - At most MAX_SWAPS tasks are swapped per adaptation call
 *   - Only tasks of type reading_practice / listening_practice / grammar can be swapped
 */

import { createServiceClient } from "@/lib/supabase/service-client";

const MAX_SWAPS = 3;
const SWAPPABLE_TYPES = ["reading_practice", "listening_practice", "grammar"] as const;

export interface AdaptPlanInput {
  userId: string;
  weakAreas: string[];
  /** If provided, only tasks on or after this date are considered. Defaults to tomorrow. */
  fromDate?: string;
}

export async function adaptActivePlan(input: AdaptPlanInput): Promise<{ swapped: number }> {
  if (input.weakAreas.length === 0) return { swapped: 0 };

  const supabase = createServiceClient();

  // Find active plan
  const { data: plan } = await supabase
    .from("learning_plans")
    .select("id")
    .eq("user_id", input.userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!plan) return { swapped: 0 };

  // Default: start from tomorrow
  const fromDate = input.fromDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  })();

  // Find future plan_days for this plan
  const { data: futureDays } = await supabase
    .from("plan_days")
    .select("id")
    .eq("plan_id", plan.id)
    .gte("plan_date", fromDate);

  if (!futureDays || futureDays.length === 0) return { swapped: 0 };

  const dayIds = futureDays.map((d: { id: string }) => d.id);

  // Find swappable tasks (not completed, right type)
  const { data: tasks } = await supabase
    .from("plan_tasks")
    .select("id, task_type, skill_focus")
    .in("day_id", dayIds)
    .in("task_type", SWAPPABLE_TYPES)
    .eq("completed", false)
    .limit(MAX_SWAPS);

  if (!tasks || tasks.length === 0) return { swapped: 0 };

  // Determine skill focus from weak areas
  const primarySkill = input.weakAreas[0]?.startsWith("reading") ? "reading"
    : input.weakAreas[0]?.startsWith("listening") ? "listening"
    : "mixed";

  const swapIds = tasks.map((t: { id: string }) => t.id);

  await supabase
    .from("plan_tasks")
    .update({
      task_type: "weak_area",
      title: "Targeted Weak-Area Practice",
      description: `Focused practice on: ${input.weakAreas.slice(0, 2).join(", ")}.`,
      skill_focus: primarySkill,
    })
    .in("id", swapIds);

  return { swapped: swapIds.length };
}
