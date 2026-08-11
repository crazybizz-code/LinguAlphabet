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

  type RawDayWithTasks = {
    id: string; day_number: number; theme: string | null;
    plan_tasks: Array<{
      id: string; task_type: string; title: string;
      estimated_minutes: number | null; completed: boolean;
      content_item_id: string | null; sequence_number: number;
    }>;
  };

  // Fetch today's day + its tasks in a single nested query (was 2 serial round-trips).
  const { data: dayRaw } = await supabase
    .from("plan_days")
    .select(`
      id, day_number, theme,
      plan_tasks(id, task_type, title, estimated_minutes, completed, content_item_id, sequence_number)
    `)
    .eq("plan_id", planId)
    .eq("plan_date", today)
    .maybeSingle();

  if (!dayRaw) return null;

  const day = dayRaw as unknown as RawDayWithTasks;
  const tasks = (day.plan_tasks ?? []).sort((a, b) => a.sequence_number - b.sequence_number);

  if (tasks.length === 0) return null;

  const unassignedIds = tasks
    .filter((t) => !t.content_item_id && !t.completed)
    .map((t) => t.id);

  if (unassignedIds.length > 0) {
    await assignContentToTasks({ userId, taskIds: unassignedIds }).catch(() => {
      // Content assignment is best-effort — never block page render
    });
  }

  return {
    dayNumber: day.day_number,
    theme: day.theme ?? null,
    tasks: tasks.map((t) => ({
      id: t.id,
      taskType: t.task_type,
      title: t.title,
      estimatedMinutes: t.estimated_minutes,
      completed: t.completed,
      contentItemId: t.content_item_id,
    })),
  };
}
