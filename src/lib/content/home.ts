import type { Database } from "@/types/supabase";
import type { PodcastContent } from "@/types/content";

type ProgressRow = Database["public"]["Tables"]["progress"]["Row"];

/** Computed server-side (in the page) so the client component never has to
 * recompute it against the browser's clock and risk a hydration mismatch. */
export function getTimeGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

/**
 * Total minutes studied this calendar week — the Weekly Goal metric
 * (docs/domain-model.md §21), deliberately independent from Streak (§19):
 * volume with gap tolerance, not daily consistency.
 */
export function buildWeeklyMinutes(podcasts: PodcastContent[], progressRows: ProgressRow[]): number {
  const byId = new Map(podcasts.map((podcast) => [podcast.id, podcast]));
  const weekStart = startOfWeek(new Date());

  return progressRows
    .filter((row) => row.completed && new Date(row.updated_at) >= weekStart)
    .reduce((sum, row) => sum + (byId.get(row.content_item_id)?.estimatedTimeMinutes ?? 0), 0);
}
