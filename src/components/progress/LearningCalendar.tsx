"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { DailyActivityPanel } from "./DailyActivityPanel";
import { EMPTY_DAILY_ACTIVITY, getDailyActivity, type DailyActivity } from "@/lib/content/daily-activity";
import type { MonthActivity } from "@/lib/content/progress";

export interface LearningCalendarProps {
  monthActivity: MonthActivity;
  dailyActivityIndex: Record<string, DailyActivity>;
  streak: number;
  longestStreak: number;
}

/** GitHub-contribution-graph-style fill per intensity level, using only the
 * existing brand ramp (globals.css's --color-primary-* steps) — no new colors. */
const INTENSITY_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-bg-muted text-text-tertiary",
  1: "bg-primary-lighter text-primary",
  2: "bg-primary-light text-primary",
  3: "bg-primary-focus text-text-on-primary",
  4: "bg-primary text-text-on-primary",
};

/**
 * The Learning Calendar — a real, clickable study timeline (docs/design-
 * system.md's "premium, calm" bar still applies: intensity coloring is
 * soft/derived from the learner's own goal, not a harsh heatmap). Clicking
 * any non-future day opens DailyActivityPanel with that day's real data
 * from buildDailyActivityIndex; future days aren't interactive since
 * nothing has happened yet.
 */
export function LearningCalendar({ monthActivity, dailyActivityIndex, streak, longestStreak }: LearningCalendarProps) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const selectedDate =
    selectedDay !== null ? new Date(new Date().getFullYear(), new Date().getMonth(), selectedDay) : null;
  const selectedActivity = selectedDate ? getDailyActivity(dailyActivityIndex, selectedDate) : null;

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-text-primary">Learning Calendar</h3>
        <span className="ml-auto text-xs text-text-tertiary">{monthActivity.monthLabel}</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {monthActivity.days.map(({ day, isToday, isFuture, intensityLevel }) => (
          <button
            key={day}
            type="button"
            disabled={isFuture}
            onClick={() => setSelectedDay(day)}
            aria-label={`View study activity for ${monthActivity.monthLabel} ${day}`}
            className={cn(
              "flex aspect-square items-center justify-center rounded-xl text-xs font-medium transition-all",
              isFuture ? "cursor-default text-text-tertiary/40" : "cursor-pointer hover:ring-2 hover:ring-primary/30",
              !isFuture && INTENSITY_CLASSES[intensityLevel],
              isToday && "font-bold ring-2 ring-primary ring-offset-1 ring-offset-bg-card",
            )}
          >
            {day}
          </button>
        ))}
      </div>

      <DailyActivityPanel
        open={selectedDay !== null}
        date={selectedDate}
        activity={selectedActivity ?? EMPTY_DAILY_ACTIVITY}
        streak={streak}
        longestStreak={longestStreak}
        onClose={() => setSelectedDay(null)}
      />
    </>
  );
}
