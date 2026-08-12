"use client";

import { motion } from "framer-motion";
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Flame,
  Headphones,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { AchievementsGrid } from "@/components/achievements/AchievementsGrid";
import { TutoNoteCard } from "@/components/mascot/TutoNoteCard";
import { LearningCalendar } from "./LearningCalendar";
import { WeeklyRecapCard } from "./WeeklyRecapCard";
import type { WeekDay, MonthActivity, RecentActivityItem } from "@/lib/content/progress";
import type { DailyActivity } from "@/lib/content/daily-activity";
import type { LastWeekSummary } from "@/lib/content/home";
import type { TutoNote } from "@/lib/tuto/messages";

const AREA_LABELS: Record<string, string> = {
  reading_comprehension: "Reading Comprehension",
  reading_detail: "Reading — Detail Questions",
  listening_comprehension: "Listening Comprehension",
  listening_detail: "Listening — Detail Questions",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
};

export interface BandPoint {
  band: number;
  label: string;
}

export interface RecentPracticeItem {
  type: "reading" | "listening" | "mock";
  label: string; // "Reading Practice", "Listening Practice", "Mock Test"
  date: string;  // formatted e.g. "9 Aug"
  correct: number;
  total: number;
  scorePct: number;
}

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
  dailyActivityIndex: Record<string, DailyActivity>;
  recentActivity: RecentActivityItem[];
  earnedAchievementIds: Set<string>;
  tutoNote: TutoNote | null;
  lastWeekSummary: LastWeekSummary | null;
  // Base44 additions
  bandTrend: BandPoint[];
  mocksCompleted: number;
  totalReadingCorrect: number;
  totalListeningCorrect: number;
  assessedCefrLevel: string | null;
  weakAreas: string[];
  // New Base44 parity props
  latestBand: number | null;
  latestReadingPct: number | null;
  latestListeningPct: number | null;
  latestCefrLevel: string | null;
  totalStudiedHours: number;
  recentPractice: RecentPracticeItem[];
  nextAssessmentDate: string | null;
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
  dailyActivityIndex,
  recentActivity,
  earnedAchievementIds,
  tutoNote,
  lastWeekSummary,
  bandTrend,
  assessedCefrLevel,
  weakAreas,
  latestBand,
  latestReadingPct,
  latestListeningPct,
  latestCefrLevel,
  totalStudiedHours,
  recentPractice,
  nextAssessmentDate,
}: ProgressViewProps) {
  const weeklyPercentage = weeklyGoalMinutes > 0 ? Math.min(100, (weeklyMinutes / weeklyGoalMinutes) * 100) : 0;
  const xpPercentage = xpToNext > 0 ? Math.min(100, (xp / xpToNext) * 100) : 0;

  const daysUntilAssessment = nextAssessmentDate
    ? Math.ceil(
        (new Date(nextAssessmentDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
          86400000,
      )
    : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      {/* ── Heading ── */}
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Your Progress
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary sm:text-[15px]">
          Based on your placement and mock assessments — not your onboarding self-report.
        </p>
      </motion.header>

      {/* ── Section 1: Estimated Level card ── */}
      {(assessedCefrLevel || latestBand !== null) && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-6 rounded-2xl border border-border bg-bg-card p-5 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            LinguABC Estimated Level
          </p>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            Not an official IELTS score
          </p>
          <div className="mt-3 flex items-center gap-4">
            {assessedCefrLevel && (
              <span className="rounded-xl bg-primary px-3 py-1.5 text-lg font-bold text-white">
                {assessedCefrLevel}
              </span>
            )}
            {latestBand !== null && (
              <span className="text-3xl font-bold text-text-primary">
                Band {latestBand.toFixed(2)}
              </span>
            )}
          </div>
          {(latestReadingPct !== null || latestListeningPct !== null) && (
            <div className="mt-4 space-y-2">
              {latestReadingPct !== null && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Reading</span>
                    <span className="text-xs font-semibold text-text-primary">
                      {Math.round(latestReadingPct)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, Math.round(latestReadingPct))}%` }}
                    />
                  </div>
                </div>
              )}
              {latestListeningPct !== null && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Listening</span>
                    <span className="text-xs font-semibold text-text-primary">
                      {Math.round(latestListeningPct)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, Math.round(latestListeningPct))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.section>
      )}

      {/* ── Section 2: Band Trend ── */}
      {bandTrend.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">Band Trend</h2>
          </div>
          <div className="flex items-end gap-3" style={{ height: 100 }}>
            {bandTrend.map((pt, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-bold text-text-primary">{pt.band.toFixed(1)}</span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-[#FF6B00] to-[#FF8C33] transition-all"
                  style={{ height: `${(pt.band / 9) * 100}%` }}
                />
                <span className="text-[10px] font-medium text-text-tertiary">{pt.label}</span>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* ── Section 3: Weak Areas ── */}
      {weakAreas.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4"
        >
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Weak Areas</h2>
          <div className="rounded-2xl border border-border bg-bg-card p-5 shadow-sm">
            <div className="space-y-2">
              {weakAreas.map((area) => (
                <div key={area} className="flex items-center gap-3 rounded-xl bg-[#FF6B00]/[.06] p-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex-1 text-sm font-medium text-text-primary">
                    {AREA_LABELS[area] ?? area.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.section>
      )}

      {/* ── Section 4: Recent Practice ── */}
      {recentPractice.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm"
        >
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Recent Practice</h2>
          <ul className="divide-y divide-border/40">
            {recentPractice.map((item, i) => {
              const Icon =
                item.type === "listening"
                  ? Headphones
                  : item.type === "mock"
                    ? ClipboardList
                    : BookOpen;
              const badgeClass =
                item.scorePct >= 70
                  ? "bg-success/10 text-success"
                  : item.scorePct >= 50
                    ? "bg-warning/10 text-warning"
                    : "bg-danger/10 text-danger";
              return (
                <li
                  key={i}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-border/40 text-text-secondary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">{item.label}</p>
                    <p className="text-xs text-text-tertiary">{item.date}</p>
                  </div>
                  <span className="shrink-0 text-xs text-text-secondary">
                    {item.correct}/{item.total}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
                    {Math.round(item.scorePct)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </motion.section>
      )}

      {/* ── Section 5: Stats compact row ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-4 grid grid-cols-3 gap-3"
      >
        {[
          { label: "Day streak", value: streak },
          { label: "Hours studied", value: totalStudiedHours },
          { label: "Last mock", value: latestCefrLevel ?? "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-bg-card p-4 text-center shadow-sm"
          >
            <p className="text-xl font-bold text-text-primary">{stat.value}</p>
            <p className="mt-0.5 text-[11px] text-text-secondary">{stat.label}</p>
          </div>
        ))}
      </motion.section>

      {/* ── Section 6: Next Assessment CTA ── */}
      {nextAssessmentDate && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-4 rounded-2xl border border-border bg-[#FF6B00]/[.06] p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-text-primary">Next assessment</p>
              <p className="mt-0.5 text-xs text-text-secondary">{nextAssessmentDate}</p>
              {daysUntilAssessment !== null && (
                <p className="mt-1 text-xs font-medium text-primary">
                  {daysUntilAssessment > 0 ? `in ${daysUntilAssessment} days` : "Due now"}
                </p>
              )}
            </div>
            <Link
              href="/mock"
              className="shrink-0 text-xs font-semibold text-primary hover:underline"
            >
              Start now →
            </Link>
          </div>
        </motion.section>
      )}

      {/* ── Section 7: View Full Plan strip ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-4"
      >
        <Link
          href="/plan"
          className="flex items-center justify-between rounded-2xl border border-border bg-bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div>
            <p className="text-sm font-bold text-text-primary">View Full Plan</p>
            <p className="text-xs text-text-secondary">Your 28-day personalised path</p>
          </div>
          <ChevronRight className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
        </Link>
      </motion.section>

      {/* ── Streak hero ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45 }}
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

      {/* ── Weekly Goal + Completed Lessons ── */}
      <div className="mt-6 grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="rounded-[1.5rem] border border-border bg-bg-muted p-6"
        >
          <div className="mb-3.5 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-text-primary">Weekly Goal</h3>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {Math.round(weeklyMinutes)} / {Math.round(weeklyGoalMinutes)}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">minutes this week</p>
          <div
            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-label="Weekly goal progress"
            aria-valuenow={Math.round(weeklyPercentage)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${weeklyPercentage}%` }}
            />
          </div>
          <div className="mt-4 flex gap-2">
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
          transition={{ duration: 0.5, delay: 0.5 }}
          className="rounded-[1.5rem] border border-border bg-bg-muted p-6"
        >
          <div className="mb-3.5 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-text-primary">Completed Lessons</h3>
          </div>
          <p className="text-2xl font-bold text-text-primary">{totalCompleted}</p>
          <p className="mt-1 text-xs text-text-tertiary">all-time lessons</p>
          {completedThisWeek > 0 && (
            <p className="mt-4 text-xs font-semibold text-success">+{completedThisWeek} this week</p>
          )}
        </motion.div>
      </div>

      {/* ── Level & XP ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.55 }}
        className="mt-6 rounded-[1.5rem] border border-border bg-bg-card p-6"
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
          className="mt-5 h-2 w-full overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label={`Progress toward level ${level + 1}`}
          aria-valuenow={Math.round(xpPercentage)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${xpPercentage}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          {Math.max(0, xpToNext - xp)} XP to Level {level + 1}
        </p>
      </motion.section>

      {/* ── Weekly Recap ── */}
      {lastWeekSummary && <WeeklyRecapCard summary={lastWeekSummary} />}

      {/* ── Learning Calendar ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="mt-6 rounded-[1.5rem] border border-border bg-bg-card p-6"
      >
        <LearningCalendar
          monthActivity={monthActivity}
          dailyActivityIndex={dailyActivityIndex}
          streak={streak}
          longestStreak={longestStreak}
        />
      </motion.section>

      {/* Recent Activity section removed — covered by "Recent Practice" above */}
      {/* Keep recentActivity available to avoid breaking callers; not rendered */}
      {false && recentActivity.length > 0 && null}

      {/* ── Milestones ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.65 }}
        className="mt-8"
      >
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary">Milestones</h3>
        </div>
        <AchievementsGrid earnedAchievementIds={earnedAchievementIds} baseDelay={0.7} />
      </motion.section>

      {tutoNote && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.75 }}
          className="mb-4 mt-8"
        >
          <TutoNoteCard note={tutoNote} />
        </motion.section>
      )}
    </div>
  );
}
