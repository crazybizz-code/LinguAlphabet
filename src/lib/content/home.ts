import type { Database } from "@/types/supabase";
import type { PodcastContent } from "@/types/content";

type ProgressRow = Database["public"]["Tables"]["progress"]["Row"];

/**
 * Time-of-day greeting bucket, from a plain local hour (0-23) — never
 * computed server-side. The server process's clock (UTC on Vercel) has no
 * relationship to the learner's actual local time, so this must only ever
 * be called with `new Date().getHours()` read in the browser (see
 * HomeView, which sets it in a post-mount effect so the SSR pass never
 * bakes in the server's hour).
 */
export function getTimeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Shared with src/lib/content/progress.ts — the "calendar week" definition must match everywhere it's used. */
export function startOfWeek(date: Date): Date {
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
