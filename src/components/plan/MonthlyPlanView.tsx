"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Headphones,
  BookCheck,
  Mic,
  PenLine,
  BarChart2,
  ListChecks,
  CheckCircle2,
  ChevronLeft,
  X,
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

const TASK_DOT_COLOR: Record<string, string> = {
  podcast: "bg-blue-400",
  listening_practice: "bg-blue-400",
  article: "bg-amber-400",
  reading_practice: "bg-amber-400",
  vocabulary: "bg-violet-400",
  grammar: "bg-green-400",
  mock: "bg-[#FF6B00]",
  review: "bg-slate-400",
  quiz: "bg-slate-400",
  weak_area: "bg-rose-400",
};

const PODCAST_TASK_TYPES = new Set(["podcast", "listening_practice"]);
const ARTICLE_TASK_TYPES = new Set(["article", "reading_practice"]);

function taskHref(task: PlanTask): string | null {
  if (!task.contentItemId) return null;
  if (PODCAST_TASK_TYPES.has(task.taskType)) return `/podcast/${task.contentItemId}/learn`;
  if (ARTICLE_TASK_TYPES.has(task.taskType)) return `/article/${task.contentItemId}/learn`;
  return null;
}

function firstIncompleteHref(tasks: PlanTask[]): string | null {
  for (const task of tasks) {
    if (task.completed) continue;
    if (task.taskType === "mock") return "/mock";
    if (task.taskType === "practice") return "/practice";
    const href = taskHref(task);
    if (href) return href;
  }
  return "/practice";
}

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoToDow(isoDate: string): number {
  // Returns 0=Mon … 6=Sun
  const d = new Date(isoDate + "T12:00:00");
  return (d.getDay() + 6) % 7;
}

function shortDayNum(isoDate: string): number {
  return new Date(isoDate + "T12:00:00").getDate();
}

function weekLabel(weekNum: number) {
  const labels = ["Foundation", "Skill Building", "Integration", "Assessment Prep"];
  return labels[weekNum - 1] ?? `Week ${weekNum}`;
}

function formatDrawerDate(isoDate: string): string {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function MonthlyPlanView({
  assessedLevel,
  weakAreas,
  days,
  today,
}: MonthlyPlanViewProps) {
  const [selectedDayId, setSelectedDayId] = useState<string | null>(
    days.find((d) => d.planDate === today)?.id ?? null,
  );

  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null;

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

      {/* ── Calendar grid ── */}
      <div className="mt-6 px-5 sm:px-8">
        {weeks.map(({ weekNum, days: weekDays }, wi) => {
          const weekTotalMins = weekDays.reduce(
            (s, d) => s + d.tasks.reduce((ts, t) => ts + (t.estimatedMinutes ?? 0), 0),
            0,
          );

          return (
            <motion.div
              key={weekNum}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 * wi }}
              className="mb-6"
            >
              {/* Week header */}
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-text-primary">
                  Week {weekNum}
                </h2>
                <span className="text-xs text-text-secondary">{weekLabel(weekNum)}</span>
                {weekTotalMins > 0 && (
                  <span className="ml-auto text-[10px] text-text-tertiary">{weekTotalMins} min</span>
                )}
              </div>

              {/* 7-column day grid */}
              <div className="grid grid-cols-7 gap-1.5 rounded-2xl border border-border bg-bg-card p-3 shadow-sm">
                {/* Column headers */}
                {DOW_LABELS.map((label) => (
                  <div key={label} className="pb-1 text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                      {label}
                    </span>
                  </div>
                ))}

                {/* Day cells */}
                {weekDays.map((day) => {
                  const isToday = day.planDate === today;
                  const isSelected = day.id === selectedDayId;
                  const allDone = day.tasks.length > 0 && day.tasks.every((t) => t.completed);
                  const someDone = !allDone && day.tasks.some((t) => t.completed);
                  const dow = isoToDow(day.planDate);
                  const totalMins = day.tasks.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);

                  return (
                    <button
                      key={day.id}
                      onClick={() => setSelectedDayId(isSelected ? null : day.id)}
                      aria-label={`Day ${day.dayNumber}${isToday ? " (today)" : ""}`}
                      style={{ gridColumnStart: dow + 1 }}
                      className={[
                        "flex flex-col items-center gap-1 rounded-xl p-2 text-center transition-all",
                        isSelected
                          ? "bg-primary/10 ring-1 ring-primary"
                          : isToday
                            ? "bg-primary/5 ring-1 ring-primary/40"
                            : "hover:bg-border/20",
                      ].join(" ")}
                    >
                      {/* Date number */}
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                          isToday
                            ? "bg-primary text-white"
                            : allDone
                              ? "text-success"
                              : "text-text-primary"
                        }`}
                      >
                        {allDone && !isToday ? (
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          shortDayNum(day.planDate)
                        )}
                      </span>

                      {/* Task dots */}
                      {day.tasks.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-0.5">
                          {day.tasks.slice(0, 3).map((task) => (
                            <span
                              key={task.id}
                              className={`h-1.5 w-1.5 rounded-full ${
                                task.completed
                                  ? "bg-success"
                                  : (TASK_DOT_COLOR[task.taskType] ?? "bg-border")
                              }`}
                            />
                          ))}
                          {day.tasks.length > 3 && (
                            <span className="h-1.5 w-1.5 rounded-full bg-border" />
                          )}
                        </div>
                      )}

                      {/* Time badge */}
                      {totalMins > 0 && (
                        <span className="text-[9px] font-medium text-text-tertiary">
                          {totalMins}m
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Fill empty cells for first week if plan doesn't start on Monday */}
                {weekNum === 1 && weekDays[0] && isoToDow(weekDays[0].planDate) > 0 && (
                  <div style={{ gridColumnStart: 1, gridColumnEnd: isoToDow(weekDays[0].planDate) + 1 }} />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Day detail drawer ── */}
      <AnimatePresence>
        {selectedDay && (
          <>
            {/* Blur overlay */}
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setSelectedDayId(null)}
            />

            {/* Drawer panel */}
            <motion.aside
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-sm flex-col bg-bg-card shadow-2xl"
            >
              {/* Drawer header */}
              <div className="flex items-start justify-between border-b border-border px-5 py-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">
                    Week {Math.ceil(selectedDay.dayNumber / 7)}
                  </p>
                  <p className="mt-0.5 text-base font-bold text-text-primary">
                    {formatDrawerDate(selectedDay.planDate)}
                  </p>
                  {selectedDay.theme && (
                    <p className="mt-0.5 text-xs text-text-secondary">{selectedDay.theme}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() => setSelectedDayId(null)}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary hover:bg-border/40"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {selectedDay.estimatedMinutes && (
                    <span className="text-xs font-semibold text-primary">
                      {selectedDay.estimatedMinutes} min total
                    </span>
                  )}
                </div>
              </div>

              {/* Task list */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {selectedDay.tasks.length === 0 ? (
                  <p className="text-sm text-text-secondary">Rest day — no tasks scheduled.</p>
                ) : (
                  <ol className="space-y-3">
                    {selectedDay.tasks.map((task, i) => {
                      const Icon = TASK_ICONS[task.taskType] ?? ListChecks;
                      const href = taskHref(task);
                      const inner = (
                        <>
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                              task.completed
                                ? "bg-success/10 text-success"
                                : "bg-border/40 text-text-secondary"
                            }`}
                          >
                            {task.completed ? (
                              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              i + 1
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm font-medium ${
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
                          {!task.completed && href && (
                            <Icon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                          )}
                        </>
                      );

                      return (
                        <li key={task.id}>
                          {href && !task.completed ? (
                            <Link
                              href={href}
                              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-border/20"
                            >
                              {inner}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-3 px-3 py-2.5">
                              {inner}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              {/* Start CTA */}
              {selectedDay.tasks.some((t) => !t.completed) && (
                <div className="border-t border-border px-5 py-4">
                  <Link
                    href={firstIncompleteHref(selectedDay.tasks) ?? "/practice"}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:bg-primary-dark hover:shadow-orange-500/30"
                  >
                    Start Today's Tasks
                  </Link>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
