import type { Database } from "@/types/supabase";
import type { PodcastContent } from "@/types/content";
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
}

export interface MonthActivity {
  monthLabel: string;
  days: CalendarDay[];
}

/** This calendar month's Learning Calendar — same "which days had activity"
 * feeling as the week strip, just zoomed out (Base44 reference: full-month grid). */
export function buildMonthActivity(progressRows: ProgressRow[], now: Date = new Date()): MonthActivity {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  const activeDays = new Set(
    progressRows
      .filter((row) => row.completed)
      .map((row) => new Date(row.updated_at))
      .filter((date) => date.getFullYear() === year && date.getMonth() === month)
      .map((date) => date.getDate()),
  );

  const days: CalendarDay[] = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return { day, active: activeDays.has(day), isToday: day === today, isFuture: day > today };
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
  podcasts: PodcastContent[],
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
