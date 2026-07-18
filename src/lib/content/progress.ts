import type { Database } from "@/types/supabase";
import type { ArticleContent, PodcastContent } from "@/types/content";
import { startOfWeek } from "./home";

type ProgressRow = Database["public"]["Tables"]["progress"]["Row"];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface WeekDay {
  label: string;
  active: boolean;
  isToday: boolean;
}

/** This calendar week (Mon-Sun), which days had at least one completion — a
 * feeling of momentum, not a stats table (docs/design-system.md). */
export function buildWeekActivity(progressRows: ProgressRow[]): WeekDay[] {
  const weekStart = startOfWeek(new Date());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeDayIndexes = new Set(
    progressRows
      .filter((row) => row.completed && new Date(row.updated_at) >= weekStart)
      .map((row) => Math.floor((new Date(row.updated_at).getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000))),
  );

  return WEEKDAY_LABELS.map((label, index) => {
    const dayDate = new Date(weekStart);
    dayDate.setDate(dayDate.getDate() + index);
    return {
      label,
      active: activeDayIndexes.has(index),
      isToday: dayDate.getTime() === today.getTime(),
    };
  });
}

export interface CalendarDay {
  day: number;
  active: boolean;
  isToday: boolean;
  isFuture: boolean;
  /** Real minutes studied that day (sum of completed items' estimated duration). */
  totalMinutes: number;
  /** GitHub-contribution-graph-style bucket, 0 (none) to 4 (heaviest) — scaled
   * against the learner's own daily goal, not a fixed minute count, so a
   * 10-minute goal and a 60-minute goal both max out meaningfully. */
  intensityLevel: 0 | 1 | 2 | 3 | 4;
}

export interface MonthActivity {
  monthLabel: string;
  days: CalendarDay[];
}

function computeIntensityLevel(minutes: number, goalMinutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  const ratio = minutes / goalMinutes;
  if (ratio < 0.5) return 1;
  if (ratio < 1) return 2;
  if (ratio < 1.5) return 3;
  return 4;
}

/** This calendar month's Learning Calendar — a real per-day study timeline
 * (minutes + GitHub-style intensity), not just presence/absence of a
 * session. `goalMinutes` is the learner's own daily-time onboarding goal,
 * so intensity is relative to them, never an arbitrary fixed threshold. */
export function buildMonthActivity(
  progressRows: ProgressRow[],
  podcasts: Array<PodcastContent | ArticleContent>,
  goalMinutes: number,
  now: Date = new Date(),
): MonthActivity {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  const podcastById = new Map(podcasts.map((podcast) => [podcast.id, podcast]));

  const minutesByDay = new Map<number, number>();
  for (const row of progressRows) {
    if (!row.completed) continue;
    const date = new Date(row.updated_at);
    if (date.getFullYear() !== year || date.getMonth() !== month) continue;
    const podcast = podcastById.get(row.content_item_id);
    if (!podcast) continue;
    const day = date.getDate();
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + podcast.estimatedTimeMinutes);
  }

  const days: CalendarDay[] = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const totalMinutes = minutesByDay.get(day) ?? 0;
    return {
      day,
      active: totalMinutes > 0,
      isToday: day === today,
      isFuture: day > today,
      totalMinutes,
      intensityLevel: computeIntensityLevel(totalMinutes, goalMinutes),
    };
  });

  return {
    monthLabel: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    days,
  };
}

export interface RecentActivityItem {
  title: string;
  relativeTime: string;
}

function formatRelativeDays(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

/** Recent completions, newest first — the Progress tab's narrative view
 * summarized from History (docs/domain-model.md §18), not a raw event log. */
export function buildRecentActivity(
  podcasts: Array<PodcastContent | ArticleContent>,
  progressRows: ProgressRow[],
  limit = 5,
  now: Date = new Date(),
): RecentActivityItem[] {
  const byId = new Map(podcasts.map((podcast) => [podcast.id, podcast]));

  return [...progressRows]
    .filter((row) => row.completed && byId.has(row.content_item_id))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit)
    .map((row) => ({
      title: byId.get(row.content_item_id)!.title,
      relativeTime: formatRelativeDays(new Date(row.updated_at), now),
    }));
}
