import type { Database } from "@/types/supabase";

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
export function buildWeeklyMinutes(
  catalog: Array<{ id: string; estimatedTimeMinutes: number }>,
  progressRows: ProgressRow[],
): number {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const weekStart = startOfWeek(new Date());

  return progressRows
    .filter((row) => row.completed && new Date(row.updated_at) >= weekStart)
    .reduce((sum, row) => sum + (byId.get(row.content_item_id)?.estimatedTimeMinutes ?? 0), 0);
}

/**
 * Sprint Learning Polish 1 ("Daily Goal on Dashboard"): the exact same
 * completed-minutes computation as buildWeeklyMinutes above, just bucketed
 * to today's calendar date instead of the week — the learner's own chosen
 * daily_time_minutes (already fetched, already editable in Profile) has
 * never had a same-day counterpart to compare against; only the ×7 weekly
 * aggregate existed before this.
 */
export function buildTodayMinutes(
  catalog: Array<{ id: string; estimatedTimeMinutes: number }>,
  progressRows: ProgressRow[],
): number {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return progressRows
    .filter((row) => row.completed && new Date(row.updated_at) >= todayStart)
    .reduce((sum, row) => sum + (byId.get(row.content_item_id)?.estimatedTimeMinutes ?? 0), 0);
}

export interface LastWeekSummary {
  completedCount: number;
  totalMinutes: number;
}

/**
 * Execution Sprint P2 ("Weekly recap ritual") — the previous calendar
 * week's totals. The retention audit's Day-30 finding was that nothing
 * gives the habit a recurring rhythm; the streak is the only number that
 * moves over time. This is deliberately just a read of data Progress
 * already fetches (no new query, no new schema, no "have we shown this
 * week's recap yet" state to track) — it advances on its own every
 * Monday simply because "last week" does. Returns null once there's
 * genuinely nothing to recap, so the card can not render rather than
 * show a hollow "0 lessons."
 */
export function buildLastWeekSummary(
  catalog: Array<{ id: string; estimatedTimeMinutes: number }>,
  progressRows: ProgressRow[],
): LastWeekSummary | null {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const thisWeekStart = startOfWeek(new Date());
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const lastWeekRows = progressRows.filter(
    (row) => row.completed && new Date(row.updated_at) >= lastWeekStart && new Date(row.updated_at) < thisWeekStart,
  );
  if (lastWeekRows.length === 0) return null;

  return {
    completedCount: lastWeekRows.length,
    totalMinutes: lastWeekRows.reduce((sum, row) => sum + (byId.get(row.content_item_id)?.estimatedTimeMinutes ?? 0), 0),
  };
}
