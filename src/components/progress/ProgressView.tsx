"use client";

import { motion } from "framer-motion";
import { Award, CalendarDays, CheckCircle2, Clock, Flame, Sparkles } from "lucide-react";
import { AchievementsGrid } from "@/components/achievements/AchievementsGrid";
import { TutoNoteCard } from "@/components/mascot/TutoNoteCard";
import type { WeekDay, MonthActivity, RecentActivityItem } from "@/lib/content/progress";
import type { TutoNote } from "@/lib/tuto/messages";

export interface ProgressViewProps {
  streak: number;
  longestStreak: number;
  level: number;
  xp: number;
  xpToNext: number;
  weeklyMinutes: number;
  weeklyGoalMinutes: number;
  weekActivity: WeekDay[];
  totalCompleted: number;
  completedThisWeek: number;
  monthActivity: MonthActivity;
  recentActivity: RecentActivityItem[];
  earnedAchievementIds: Set<string>;
  tutoNote: TutoNote | null;
}

export function ProgressView({
  streak,
  longestStreak,
  level,
  xp,
  xpToNext,
  weeklyMinutes,
  weeklyGoalMinutes,
  weekActivity,
  totalCompleted,
  completedThisWeek,
  monthActivity,
  recentActivity,
  earnedAchievementIds,
  tutoNote,
}: ProgressViewProps) {
  const weeklyPercentage = weeklyGoalMinutes > 0 ? Math.min(100, (weeklyMinutes / weeklyGoalMinutes) * 100) : 0;
  const xpPercentage = xpToNext > 0 ? Math.min(100, (xp / xpToNext) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Your Journey</h1>
        <p className="mt-1.5 text-sm text-text-secondary sm:text-[15px]">
          Every step forward brings you closer to fluency.
        </p>
      </motion.header>

      {/* Streak hero — the single most important momentum signal (docs/domain-model.md §19). */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-[#FF8C33] p-6 shadow-glow sm:p-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70">Current Streak</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-white">{streak}</span>
              <span className="text-lg font-semibold text-white/80">{streak === 1 ? "day" : "days"}</span>
            </div>
            <p className="mt-1 text-sm text-white/70">
              {longestStreak > streak ? `Your longest streak was ${longestStreak} days` : "Your longest streak yet!"}
            </p>
          </div>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white/20">
            <Flame className="h-8 w-8 text-white" aria-hidden="true" />
          </div>
        </div>
      </motion.section>

      {/* Weekly Goal (minutes, not sessions — docs/domain-model.md §21, deliberately
          independent from Streak) and lifetime completion count, side by side. */}
      <div className="mt-5 grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="rounded-[1.5rem] border border-border bg-bg-muted p-5"
        >
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold text-text-primary">Weekly Goal</p>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {Math.round(weeklyMinutes)} / {Math.round(weeklyGoalMinutes)}
          </p>
          <p className="mt-0.5 text-xs text-text-tertiary">minutes this week</p>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-label="Weekly goal progress"
            aria-valuenow={Math.round(weeklyPercentage)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${weeklyPercentage}%` }} />
          </div>
          <div className="mt-3 flex gap-1.5">
            {weekActivity.map((day) => (
              <div key={day.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={`h-2 w-full rounded-full ${day.active ? "bg-primary" : "bg-border"} ${day.isToday ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-bg-muted" : ""}`}
                />
                <span className="text-[10px] font-medium text-text-tertiary">{day.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="rounded-[1.5rem] border border-border bg-bg-muted p-5"
        >
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold text-text-primary">Completed Lessons</p>
          </div>
          <p className="text-2xl font-bold text-text-primary">{totalCompleted}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">all-time lessons</p>
          {completedThisWeek > 0 && (
            <p className="mt-3 text-xs font-semibold text-success">+{completedThisWeek} this week</p>
          )}
        </motion.div>
      </div>

      {/* Level & XP — motivational growth, never a percentage or graded score
          (docs/domain-model.md §20). The bar shows distance to a concrete next
          goal, not a score out of 100. */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25 }}
        className="mt-5 rounded-[1.5rem] border border-border bg-bg-card p-5"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-lighter text-sm font-bold text-primary">
            Lv{level}
          </span>
          <div>
            <p className="text-sm font-bold text-text-primary">Level {level}</p>
            <p className="text-xs text-text-tertiary">{xp} XP earned</p>
          </div>
          <Award className="ml-auto h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label={`Progress toward level ${level + 1}`}
          aria-valuenow={Math.round(xpPercentage)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${xpPercentage}%` }} />
        </div>
        <p className="mt-2 text-xs text-text-tertiary">{Math.max(0, xpToNext - xp)} XP to Level {level + 1}</p>
      </motion.section>

      {/* Learning Calendar — the whole month's activity pattern, soft and
          non-judgmental (no numbers, just presence/absence of a session). */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-5 rounded-[1.5rem] border border-border bg-bg-card p-5"
      >
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
          <p className="text-sm font-semibold text-text-primary">Learning Calendar</p>
          <span className="ml-auto text-xs text-text-tertiary">{monthActivity.monthLabel}</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {monthActivity.days.map(({ day, active, isToday, isFuture }) => (
            <div
              key={day}
              className={`flex aspect-square items-center justify-center rounded-xl text-xs font-medium transition-all ${
                isToday
                  ? "bg-primary font-bold text-text-on-primary"
                  : active
                    ? "bg-primary-lighter font-semibold text-primary"
                    : isFuture
                      ? "text-text-tertiary/40"
                      : "text-text-tertiary"
              }`}
            >
              {day}
            </div>
          ))}
        </div>
      </motion.section>

      {/* Recent Activity — History (docs/domain-model.md §18) summarized narratively. */}
      {recentActivity.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-5 rounded-[1.5rem] border border-border bg-bg-card p-5"
        >
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold text-text-primary">Recent Activity</p>
          </div>
          <ul className="flex flex-col gap-3">
            {recentActivity.map((item, index) => (
              <li key={`${item.title}-${index}`} className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-text-secondary">{item.title}</p>
                <span className="shrink-0 text-xs text-text-tertiary">{item.relativeTime}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {/* Milestones — earned vs. locked, computed from real state (docs/domain-model.md §22). */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-8"
      >
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary">Milestones</h2>
        </div>
        <AchievementsGrid earnedAchievementIds={earnedAchievementIds} baseDelay={0.45} />
      </motion.section>

      {tutoNote && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mb-4 mt-8"
        >
          <TutoNoteCard note={tutoNote} />
        </motion.section>
      )}
    </div>
  );
}
