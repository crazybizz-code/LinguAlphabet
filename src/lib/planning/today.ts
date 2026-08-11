/**
 * Fetch today's plan day and its tasks for a given user.
 * Returns null if no active plan exists for today.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { assignContentToTasks } from "./content-selector";

export interface TodayPlanDay {
  dayNumber: number;
  theme: string | null;
  tasks: Array<{
    id: string;
    taskType: string;
    title: string;
    estimatedMinutes: number | null;
    completed: boolean;
    contentItemId: string | null;
  }>;
}

export async function fetchTodayPlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  /** Pre-fetched active plan ID — skips an internal DB round trip when provided. */
  prefetchedPlanId?: string | null,
): Promise<TodayPlanDay | null> {
  const today = new Date().toISOString().split("T")[0];

  let planId: string | null | undefined = prefetchedPlanId;

  if (planId === undefined) {
    // Find active plan (only when not pre-fetched)
    const { data: plan } = await supabase
      .from("learning_plans")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    planId = plan?.id ?? null;
  }

  if (!planId) return null;

  // Find today's day row
  const { data: day } = await supabase
    .from("plan_days")
    .select("id, day_number, theme")
    .eq("plan_id", planId)
    .eq("plan_date", today)
    .maybeSingle();

  if (!day) return null;

  // Fetch tasks for today
  const { data: tasks } = await supabase
    .from("plan_tasks")
    .select("id, task_type, title, estimated_minutes, completed, content_item_id")
    .eq("day_id", day.id)
    .order("sequence_number", { ascending: true });

  if (!tasks || tasks.length === 0) return null;

  // Lazily assign content to eligible tasks (fire-and-forget on server)
  const unassignedIds = tasks
    .filter((t: { content_item_id: string | null; completed: boolean }) => !t.content_item_id && !t.completed)
    .map((t: { id: string }) => t.id);

  if (unassignedIds.length > 0) {
    await assignContentToTasks({ userId, taskIds: unassignedIds }).catch(() => {
      // Content assignment is best-effort — never block page render
    });
  }

  return {
    dayNumber: day.day_number,
    theme: day.theme ?? null,
    tasks: tasks.map((t: {
      id: string; task_type: string; title: string;
      estimated_minutes: number | null; completed: boolean; content_item_id: string | null;
    }) => ({
      id: t.id,
      taskType: t.task_type,
      title: t.title,
      estimatedMinutes: t.estimated_minutes,
      completed: t.completed,
      contentItemId: t.content_item_id,
    })),
  };
}
