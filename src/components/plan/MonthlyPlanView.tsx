"use client";

import { motion } from "framer-motion";
import {
  BookOpen,
  Headphones,
  BookCheck,
  Mic,
  PenLine,
  BarChart2,
  ListChecks,
  Calendar,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";

export interface PlanTask {
  id: string;
  taskType: string;
  title: string;
  estimatedMinutes: number | null;
  skillFocus: string | null;
  completed: boolean;
  contentItemId: string | null;
}

export interface PlanDay {
  id: string;
  dayNumber: number;
  planDate: string;
  focus: string | null;
  theme: string | null;
  estimatedMinutes: number | null;
  tasks: PlanTask[];
}

export interface MonthlyPlanViewProps {
  planId: string;
  assessedLevel: string | null;
  targetLevel: string | null;
  startsOn: string;
  endsOn: string;
  weakAreas: string[];
  days: PlanDay[];
  today: string;
}

const TASK_ICONS: Record<string, typeof BookOpen> = {
  podcast: Headphones,
  listening_practice: Headphones,
  article: BookOpen,
  reading_practice: BookOpen,
  vocabulary: PenLine,
  grammar: BookCheck,
  weak_area: BarChart2,
  quiz: ListChecks,
  review: BookCheck,
  mock: Mic,
};

const PODCAST_TASK_TYPES = new Set(["podcast", "listening_practice"]);
const ARTICLE_TASK_TYPES = new Set(["article", "reading_practice"]);

function taskHref(task: PlanTask): string | null {
  if (!task.contentItemId) return null;
  if (PODCAST_TASK_TYPES.has(task.taskType)) return `/podcast/${task.contentItemId}/learn`;
  if (ARTICLE_TASK_TYPES.has(task.taskType)) return `/article/${task.contentItemId}/learn`;
  return null;
}

// ── Chip data for day-row task pills ────────────────────────────────────────

const TASK_CHIP: Record<string, string> = {
  podcast: "Podcast",
  listening_practice: "Listening",
  article: "Article",
  reading_practice: "Reading",
  vocabulary: "Vocab",
  grammar: "Grammar",
  mock: "Mock",
  review: "Review",
  quiz: "Quiz",
  weak_area: "Focus",
};

const CHIP_STYLE: Record<string, string> = {
  podcast: "bg-blue-50 text-blue-600",
  listening_practice: "bg-blue-50 text-blue-600",
  article: "bg-amber-50 text-amber-600",
  reading_practice: "bg-amber-50 text-amber-600",
  vocabulary: "bg-violet-50 text-violet-600",
  grammar: "bg-green-50 text-green-600",
  mock: "bg-[#FF6B00]/10 text-[#FF6B00]",
  review: "bg-slate-100 text-slate-600",
  quiz: "bg-slate-100 text-slate-600",
  weak_area: "bg-rose-50 text-rose-600",
};

// ── Date helpers ─────────────────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(isoDate: string): string {
  return DOW[new Date(isoDate + "T12:00:00").getDay()];
}

function shortDate(isoDate: string): string {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function weekLabel(weekNum: number) {
  const labels = ["Foundation", "Skill Building", "Integration", "Assessment Prep"];
  return labels[weekNum - 1] ?? `Week ${weekNum}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function MonthlyPlanView({
  assessedLevel,
  weakAreas,
  days,
  today,
}: MonthlyPlanViewProps) {
  const [selectedDayId, setSelectedDayId] = useState<string | null>(
    days.find((d) => d.planDate === today)?.id ?? days[0]?.id ?? null,
  );

  const completedDays = days.filter(
    (d) => d.tasks.length > 0 && d.tasks.every((t) => t.completed),
  ).length;

  // Group days into 4 weeks of 7
  const weeks = [1, 2, 3, 4].map((w) => ({
    weekNum: w,
    days: days.slice((w - 1) * 7, w * 7),
  }));

  return (
    <div className="mx-auto max-w-3xl pb-10">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="px-5 pt-6 sm:px-8"
      >
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-extrabold text-text-primary sm:text-3xl">
              Your 28-Day Plan
            </h1>
            {assessedLevel && (
              <p className="mt-1 text-sm text-text-secondary">
                Tailored for {assessedLevel} level
                {weakAreas.length > 0 && ` · focus: ${weakAreas.slice(0, 2).join(", ")}`}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold text-text-primary">{completedDays}</span>
            <span className="text-xs text-text-secondary">days done</span>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${Math.round((completedDays / 28) * 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <p className="mt-1.5 text-right text-xs text-text-secondary">
          {Math.round((completedDays / 28) * 100)}% complete
        </p>
      </motion.div>

      {/* ── Week accordion sections ── */}
      {weeks.map(({ weekNum, days: weekDays }, wi) => {
        const weekCompletedDays = weekDays.filter(
          (d) => d.tasks.length > 0 && d.tasks.every((t) => t.completed),
        ).length;

        return (
          <motion.section
            key={weekNum}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 * wi }}
            className="mt-6 px-5 sm:px-8"
            aria-labelledby={`week-${weekNum}-heading`}
          >
            {/* Week header */}
            <div className="mb-2 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
              <h2
                id={`week-${weekNum}-heading`}
                className="text-xs font-semibold uppercase tracking-wide text-text-secondary"
              >
                Week {weekNum} · {weekLabel(weekNum)}
              </h2>
              <span className="ml-auto rounded-full bg-border/60 px-2 py-0.5 text-[10px] font-semibold text-text-tertiary">
                {weekCompletedDays}/{weekDays.length}
              </span>
            </div>

            {/* Day rows */}
            <div className="divide-y divide-border/30 rounded-2xl border border-border bg-bg-card shadow-sm">
              {weekDays.map((day) => {
                const isToday = day.planDate === today;
                const isSelected = day.id === selectedDayId;
                const allTasksDone =
                  day.tasks.length > 0 && day.tasks.every((t) => t.completed);
                const someTasksDone = !allTasksDone && day.tasks.some((t) => t.completed);
                const totalMins = day.tasks.reduce(
                  (s, t) => s + (t.estimatedMinutes ?? 0),
                  0,
                );

                return (
                  <div key={day.id}>
                    {/* Day row button */}
                    <button
                      onClick={() =>
                        setSelectedDayId(isSelected ? null : day.id)
                      }
                      aria-label={`Day ${day.dayNumber}${isToday ? " (today)" : ""}`}
                      aria-expanded={isSelected}
                      className={[
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl",
                        isSelected
                          ? "border-l-2 border-primary bg-primary/5"
                          : isToday
                            ? "ring-inset ring-1 ring-primary"
                            : "hover:bg-border/20",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {/* Day + date */}
                      <div className="w-20 shrink-0">
                        <p className="text-xs font-bold text-text-primary">
                          {dayLabel(day.planDate)}
                        </p>
                        <p className="text-[10px] text-text-tertiary">
                          {shortDate(day.planDate)}
                        </p>
                      </div>

                      {/* Task chips */}
                      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                        {day.tasks.slice(0, 4).map((task) => (
                          <span
                            key={task.id}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              CHIP_STYLE[task.taskType] ?? "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {TASK_CHIP[task.taskType] ?? task.taskType}
                          </span>
                        ))}
                        {day.tasks.length > 4 && (
                          <span className="rounded-full bg-border/60 px-2 py-0.5 text-[10px] font-semibold text-text-tertiary">
                            +{day.tasks.length - 4}
                          </span>
                        )}
                      </div>

                      {/* Minutes */}
                      {totalMins > 0 && (
                        <span className="shrink-0 text-xs text-text-tertiary">
                          {totalMins}m
                        </span>
                      )}

                      {/* Completion indicator */}
                      <span className="ml-1 shrink-0">
                        {allTasksDone ? (
                          <CheckCircle2
                            className="h-4 w-4 text-success"
                            aria-label="All done"
                          />
                        ) : someTasksDone ? (
                          <span
                            className="flex h-4 w-4 items-center justify-center rounded-full bg-warning/20"
                            aria-label="Partially done"
                          >
                            <span className="h-2 w-2 rounded-full bg-warning" />
                          </span>
                        ) : (
                          <span
                            className="flex h-4 w-4 items-center justify-center rounded-full border border-border"
                            aria-label="Not started"
                          />
                        )}
                      </span>
                    </button>

                    {/* Inline expanded task list */}
                    {isSelected && day.tasks.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-border/40 bg-bg-muted px-4 pb-3 pt-2"
                      >
                        {day.theme && (
                          <p className="mb-2 text-xs font-semibold text-text-secondary">
                            {day.theme}
                            {day.estimatedMinutes && (
                              <span className="ml-2 text-text-tertiary">
                                · ~{day.estimatedMinutes} min
                              </span>
                            )}
                          </p>
                        )}
                        <ul className="space-y-1">
                          {day.tasks.map((task) => {
                            const Icon = TASK_ICONS[task.taskType] ?? ListChecks;
                            const href = taskHref(task);
                            const inner = (
                              <>
                                <span
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                    task.completed
                                      ? "bg-success/10 text-success"
                                      : "bg-border/40 text-text-secondary"
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={`truncate text-sm font-medium ${
                                      task.completed
                                        ? "text-text-secondary line-through"
                                        : "text-text-primary"
                                    }`}
                                  >
                                    {task.title}
                                  </p>
                                  {task.estimatedMinutes && (
                                    <p className="text-[11px] text-text-tertiary">
                                      {task.estimatedMinutes} min
                                    </p>
                                  )}
                                </div>
                                {task.completed ? (
                                  <svg
                                    viewBox="0 0 12 12"
                                    className="h-4 w-4 shrink-0 text-success"
                                    aria-label="Done"
                                  >
                                    <path
                                      d="M10 3L5 9 2 6"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      fill="none"
                                    />
                                  </svg>
                                ) : href ? (
                                  <ChevronRightIcon
                                    className="h-4 w-4 shrink-0 text-text-tertiary"
                                    aria-hidden="true"
                                  />
                                ) : null}
                              </>
                            );
                            return (
                              <li key={task.id}>
                                {href && !task.completed ? (
                                  <Link
                                    href={href}
                                    className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-border/30"
                                  >
                                    {inner}
                                  </Link>
                                ) : (
                                  <div className="flex items-center gap-2.5 px-2 py-2">
                                    {inner}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.section>
        );
      })}
    </div>
  );
}
