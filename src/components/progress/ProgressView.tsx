"use client";

import { motion } from "framer-motion";
import {
  AlertCircle,
  Award,
  BookOpen,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Clock,
  Flame,
  Headphones,
} from "lucide-react";
import Link from "next/link";
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
  label: string;
  date: string;
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
  bandTrend: BandPoint[];
  mocksCompleted: number;
  totalReadingCorrect: number;
  totalListeningCorrect: number;
  assessedCefrLevel: string | null;
  weakAreas: string[];
  latestBand: number | null;
  latestReadingBand: number | null;
  latestListeningBand: number | null;
  latestCefrLevel: string | null;
  totalStudiedHours: number;
  recentPractice: RecentPracticeItem[];
  nextAssessmentDate: string | null;
}

export function ProgressView({
  streak,
  assessedCefrLevel,
  weakAreas,
  latestBand,
  latestReadingBand,
  latestListeningBand,
  latestCefrLevel,
  totalStudiedHours,
  recentPractice,
  nextAssessmentDate,
  bandTrend,
  // retained in props but not rendered — keep for backwards compat
  longestStreak: _longestStreak,
  level: _level,
  xp: _xp,
  xpToNext: _xpToNext,
  weeklyMinutes: _weeklyMinutes,
  weeklyGoalMinutes: _weeklyGoalMinutes,
  weekActivity: _weekActivity,
  totalCompleted: _totalCompleted,
  completedThisWeek: _completedThisWeek,
  monthActivity: _monthActivity,
  dailyActivityIndex: _dailyActivityIndex,
  recentActivity: _recentActivity,
  earnedAchievementIds: _earnedAchievementIds,
  tutoNote: _tutoNote,
  lastWeekSummary: _lastWeekSummary,
  mocksCompleted: _mocksCompleted,
  totalReadingCorrect: _totalReadingCorrect,
  totalListeningCorrect: _totalListeningCorrect,
}: ProgressViewProps) {
  const daysUntilAssessment = nextAssessmentDate
    ? Math.ceil(
        (new Date(nextAssessmentDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
          86400000,
      )
    : null;

  const hasMockData = latestBand !== null || assessedCefrLevel !== null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 md:py-10">
      {/* ── Heading ── */}
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Your Progress</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Based on your placement and mock assessments — not your onboarding self-report.
        </p>
      </motion.header>

      {/* ── Section 1: Hero level card ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="mt-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-6 shadow-lg"
      >
        {/* Eyebrow + disclaimer */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
            English Level
          </p>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold text-white/50">
            Not an official IELTS score
          </span>
        </div>

        {/* Top row */}
        <div className="mt-1 flex items-start justify-between">
          <div>
            <p className="text-5xl font-black leading-none text-white">
              {assessedCefrLevel ?? "—"}
            </p>
            {!hasMockData && (
              <p className="mt-1 text-[11px] text-white/40">Take a mock to get assessed</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
              Est. Band
            </p>
            <p className="mt-1 text-3xl font-black text-white">
              {latestBand !== null ? latestBand.toFixed(2) : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-white/40">LinguABC estimate</p>
          </div>
        </div>

        {/* Section sub-cards */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(255,107,0,0.18)" }}>
                <BookOpen className="h-3.5 w-3.5 text-[#FF6B00]" />
              </div>
              <p className="text-xs font-semibold text-white/70">Reading</p>
            </div>
            {latestReadingBand !== null ? (
              <>
                <p className="mt-2 text-xl font-black text-white">{latestReadingBand.toFixed(1)}</p>
                <p className="text-[10px] text-white/40">Last mock band</p>
              </>
            ) : (
              <p className="mt-2 text-xs text-white/30">Take a mock</p>
            )}
          </div>

          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(59,130,246,0.18)" }}>
                <Headphones className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <p className="text-xs font-semibold text-white/70">Listening</p>
            </div>
            {latestListeningBand !== null ? (
              <>
                <p className="mt-2 text-xl font-black text-white">{latestListeningBand.toFixed(1)}</p>
                <p className="text-[10px] text-white/40">Last mock band</p>
              </>
            ) : (
              <p className="mt-2 text-xs text-white/30">Take a mock</p>
            )}
          </div>
        </div>
      </motion.section>

      {/* ── Section 2: Band Trend ── */}
      {bandTrend.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm"
        >
          <h2 className="mb-4 text-sm font-semibold text-text-primary">Band Trend</h2>
          {/* Sparkline-style chart */}
          <div className="relative">
            <div className="flex items-end gap-2" style={{ height: 80 }}>
              {bandTrend.map((pt, i) => {
                const barH = Math.max(8, (pt.band / 9) * 100);
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[11px] font-bold text-text-primary">{pt.band.toFixed(1)}</span>
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-primary to-[#FF8C33]"
                      style={{ height: `${barH}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              {bandTrend.map((pt, i) => (
                <div key={i} className="flex flex-1 justify-center">
                  <span className="text-[10px] text-text-tertiary">{pt.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.section>
      )}

      {/* ── Section 3: Weak Areas ── */}
      {weakAreas.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-4 rounded-2xl border border-border bg-bg-card p-5 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Weak Areas</h2>
            <Link href="/practice" className="text-xs font-semibold text-primary hover:underline">
              Practice weak areas →
            </Link>
          </div>
          <div className="space-y-2">
            {weakAreas.map((area) => (
              <div key={area} className="flex items-center gap-3 rounded-xl bg-[#FF6B00]/[.06] p-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="flex-1 text-sm font-medium text-text-primary">
                  {AREA_LABELS[area] ?? area.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* ── Section 4: Recent Practice ── */}
      {recentPractice.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
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
              const iconStyle =
                item.type === "listening"
                  ? "bg-green-50 text-green-600"
                  : item.type === "mock"
                    ? "bg-primary/10 text-primary"
                    : "bg-amber-50 text-amber-600";
              return (
                <li key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconStyle}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">{item.label}</p>
                    <p className="text-xs text-text-tertiary">{item.date}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-text-primary">
                      {item.correct}/{item.total}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      {Math.round(item.scorePct)}% accuracy
                    </p>
                  </div>
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
        transition={{ duration: 0.5, delay: 0.25 }}
        className="mt-4 grid grid-cols-3 gap-3"
      >
        {[
          { label: "Day streak", value: streak, icon: Flame },
          { label: "Hours studied", value: totalStudiedHours, icon: Clock },
          { label: "Last mock", value: latestCefrLevel ?? "—", icon: Award },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-bg-card p-4 text-center shadow-sm"
          >
            <stat.icon className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
            <p className="mt-2 text-xl font-bold text-text-primary">{stat.value}</p>
            <p className="mt-0.5 text-[11px] text-text-secondary">{stat.label}</p>
          </div>
        ))}
      </motion.section>

      {/* ── Section 6: Next Assessment ── */}
      {nextAssessmentDate && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-4 rounded-2xl border border-border bg-[#FF6B00]/[.06] p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-text-primary">Next assessment</p>
                <p className="mt-0.5 text-xs text-text-secondary">{nextAssessmentDate}</p>
                {daysUntilAssessment !== null && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    {daysUntilAssessment > 0 ? `in ${daysUntilAssessment} days` : "Due now"}
                  </p>
                )}
              </div>
            </div>
            <Link
              href="/mock"
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
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
        transition={{ duration: 0.5, delay: 0.35 }}
        className="mt-4 mb-6"
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
    </div>
  );
}
