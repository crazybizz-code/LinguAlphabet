/**
 * Content Selector — lazily assigns content_item_id to plan tasks.
 *
 * The plan generator intentionally leaves content_item_id null at generation
 * time. This module fills it in just-in-time when the learner opens a day,
 * matching published content to each task's skill focus, CEFR level, and
 * content type (podcast → task_type podcast/listening_practice,
 * article → task_type article/reading_practice).
 *
 * Only tasks that are:
 *   - not yet completed
 *   - have content_item_id = null
 *   - have a task_type that maps to a content type
 * are eligible for assignment.
 */

import { createServiceClient } from "@/lib/supabase/service-client";

const CONTENT_TYPES_FOR_TASK: Record<string, "podcast" | "article" | null> = {
  podcast: "podcast",
  listening_practice: "podcast",
  article: "article",
  reading_practice: "article",
};

export interface AssignContentInput {
  userId: string;
  taskIds: string[];
}

export interface AssignContentResult {
  assigned: number;
}

export async function assignContentToTasks(input: AssignContentInput): Promise<AssignContentResult> {
  if (input.taskIds.length === 0) return { assigned: 0 };

  const supabase = createServiceClient();

  // Fetch tasks that need content
  const { data: tasks } = await supabase
    .from("plan_tasks")
    .select("id, task_type, cefr_level, skill_focus")
    .in("id", input.taskIds)
    .is("content_item_id", null)
    .eq("completed", false);

  if (!tasks || tasks.length === 0) return { assigned: 0 };

  // Load already-completed content for this user (don't repeat)
  const { data: progressRows } = await supabase
    .from("progress")
    .select("content_item_id")
    .eq("user_id", input.userId)
    .eq("completed", true);

  const completedIds = new Set((progressRows ?? []).map((p: { content_item_id: string }) => p.content_item_id));

  let assigned = 0;

  for (const task of tasks as { id: string; task_type: string; cefr_level: string | null; skill_focus: string | null }[]) {
    const contentType = CONTENT_TYPES_FOR_TASK[task.task_type];
    if (!contentType) continue;

    const level = task.cefr_level ?? "B1";

    // Pick a matching published item not already completed
    const { data: candidates } = await supabase
      .from("content_items")
      .select("id")
      .eq("content_type", contentType)
      .eq("status", "published")
      .lte("cefr_level_min", level)
      .gte("cefr_level_max", level)
      .limit(20);

    if (!candidates || candidates.length === 0) continue;

    const fresh = candidates.filter((c: { id: string }) => !completedIds.has(c.id));
    const pool = fresh.length > 0 ? fresh : candidates;
    const picked = pool[Math.floor(Math.random() * pool.length)] as { id: string };

    await supabase
      .from("plan_tasks")
      .update({ content_item_id: picked.id })
      .eq("id", task.id);

    assigned++;
  }

  return { assigned };
}
