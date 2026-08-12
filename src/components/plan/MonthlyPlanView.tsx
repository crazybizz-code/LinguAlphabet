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
import { useState, type CSSProperties } from "react";
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

const TASK_LABELS: Record<string, string> = {
  podcast: "Podcast",
  listening_practice: "Listening",
  article: "Article",
  reading_practice: "Reading",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  weak_area: "Weak Area",
  quiz: "Quiz",
  review: "Review",
  mock: "Mock",
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
  const date = new Date(isoDate + "T12:00:00");
  return (date.getDay() + 6) % 7;
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

export function MonthlyPlanView({ assessedLevel, weakAreas, days, today }: MonthlyPlanViewProps) {
  const [selectedDayId, setSelectedDayId] = useState<string | null>(days.find((day) => day.planDate === today)?.id ?? null);
  const selectedDay = days.find((day) => day.id === selectedDayId) ?? null;
  const completedDays = days.filter((day) => day.tasks.length > 0 && day.tasks.every((task) => task.completed)).length;
  const weeks = [1, 2, 3, 4].map((weekNum) => ({ weekNum, days: days.slice((weekNum - 1) * 7, weekNum * 7) }));
  const selectedTotalMinutes = selectedDay?.tasks.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0) ?? 0;

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="px-5 pt-8 sm:px-8 md:pt-10">
        <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-extrabold text-text-primary sm:text-3xl">Your 28-Day Plan</h1>
            <p className="mt-1 text-sm text-text-secondary">
              {assessedLevel ? `Tailored for ${assessedLevel} level` : "A focused month of daily English practice"}
              {weakAreas.length > 0 && ` · focus: ${weakAreas.slice(0, 2).join(", ")}`}
            </p>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold text-text-primary">{completedDays}</span>
            <span className="text-xs text-text-secondary">days done</span>
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border">
          <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${Math.round((completedDays / 28) * 100)}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
        </div>
        <p className="mt-1.5 text-right text-xs text-text-secondary">{Math.round((completedDays / 28) * 100)}% complete</p>
      </motion.header>

      <div className="mt-6 px-5 sm:px-8">
        {weeks.map(({ weekNum, days: weekDays }, weekIndex) => {
          const weekTotalMins = weekDays.reduce((sum, day) => sum + day.tasks.reduce((taskSum, task) => taskSum + (task.estimatedMinutes ?? 0), 0), 0);
          return (
            <motion.section key={weekNum} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 * weekIndex }} className="mb-6">
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-text-primary">Week {weekNum}</h2>
                <span className="text-xs text-text-secondary">{weekLabel(weekNum)}</span>
                {weekTotalMins > 0 && <span className="ml-auto text-[10px] text-text-tertiary">{weekTotalMins} min</span>}
              </div>
              {/*
                Base44 reference has no day-of-week header row and no
                fixed weekday-column alignment at any breakpoint -- days
                simply reflow through a responsive 2/4/7-column grid. This
                app's existing Mon-Sun header row + gridColumnStart
                alignment is preserved, but ONLY at the lg (7-column)
                breakpoint where it's visually meaningful; below that,
                where the grid no longer has 7 columns, days fall back to
                normal sequential grid flow (Base44's actual behavior at
                every breakpoint) via the lg:-scoped arbitrary property
                below instead of an always-on inline style.
              */}
              <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border bg-bg-card p-3 shadow-sm sm:grid-cols-4 lg:grid-cols-7">
                {DOW_LABELS.map((label) => (
                  <div key={label} className="pb-1 text-center max-lg:hidden"><span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">{label}</span></div>
                ))}
                {weekDays.map((day) => {
                  const isToday = day.planDate === today;
                  const isSelected = day.id === selectedDayId;
                  const allDone = day.tasks.length > 0 && day.tasks.every((task) => task.completed);
                  const totalMins = day.tasks.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0);
                  return (
                    <button
                      key={day.id}
                      onClick={() => setSelectedDayId(isSelected ? null : day.id)}
                      // "Today" has no distinct Base44 visual state (only
                      // completed/selected do) -- kept here ONLY as a
                      // screen-reader affordance, never as styling.
                      aria-label={`Day ${day.dayNumber}${isToday ? " (today)" : ""}`}
                      style={{ "--dow-col": String(isoToDow(day.planDate) + 1) } as CSSProperties}
                      className={[
                        "flex min-h-16 flex-col items-center gap-1 rounded-xl p-2 text-center transition-all lg:[grid-column-start:var(--dow-col)]",
                        isSelected ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-border/20",
                      ].join(" ")}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${allDone ? "text-success" : "text-text-primary"}`}>
                        {allDone ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : shortDayNum(day.planDate)}
                      </span>
                      {day.tasks.length > 0 && (
                        <span className="flex flex-wrap justify-center gap-0.5">
                          {day.tasks.slice(0, 3).map((task) => <span key={task.id} className={`h-1.5 w-1.5 rounded-full ${task.completed ? "bg-success" : (TASK_DOT_COLOR[task.taskType] ?? "bg-border")}`} />)}
                          {day.tasks.length > 3 && <span className="h-1.5 w-1.5 rounded-full bg-border" />}
                        </span>
                      )}
                      {totalMins > 0 && <span className="text-[9px] font-medium text-text-tertiary">{totalMins}m</span>}
                    </button>
                  );
                })}
                {weekNum === 1 && weekDays[0] && isoToDow(weekDays[0].planDate) > 0 && (
                  <div className="max-lg:hidden" style={{ gridColumnStart: 1, gridColumnEnd: isoToDow(weekDays[0].planDate) + 1 }} />
                )}
              </div>
            </motion.section>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedDay && (
          <>
            <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]" onClick={() => setSelectedDayId(null)} />
            <motion.aside key="drawer" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 32 }} className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-sm flex-col bg-bg-card shadow-2xl">
              <div className="flex items-start justify-between border-b border-border px-5 py-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Week {Math.ceil(selectedDay.dayNumber / 7)} · Day {selectedDay.dayNumber}</p>
                  <p className="mt-0.5 text-base font-bold text-text-primary">{formatDrawerDate(selectedDay.planDate)}</p>
                  {selectedDay.theme && <p className="mt-0.5 text-xs text-text-secondary">{selectedDay.theme}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button onClick={() => setSelectedDayId(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary hover:bg-border/40"><X className="h-4 w-4" aria-hidden="true" /></button>
                  {selectedTotalMinutes > 0 && <span className="text-xs font-semibold text-primary">{selectedTotalMinutes} min total</span>}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {selectedDay.tasks.length === 0 ? <p className="text-sm text-text-secondary">Rest day. No tasks scheduled.</p> : (
                  <ol className="space-y-3">
                    {selectedDay.tasks.map((task, index) => {
                      const Icon = TASK_ICONS[task.taskType] ?? ListChecks;
                      const href = taskHref(task);
                      const item = (
                        <>
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${task.completed ? "bg-success/10 text-success" : "bg-border/40 text-text-secondary"}`}>{task.completed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}</span>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{TASK_LABELS[task.taskType] ?? task.taskType}</span>
                              {task.estimatedMinutes && <span className="text-[10px] font-semibold text-text-tertiary">{task.estimatedMinutes} min</span>}
                            </div>
                            <p className={`text-sm font-medium ${task.completed ? "text-text-secondary line-through" : "text-text-primary"}`}>{index + 1}. {task.title}</p>
                          </div>
                          {!task.completed && href && <Icon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />}
                        </>
                      );
                      return <li key={task.id}>{href && !task.completed ? <Link href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-border/20">{item}</Link> : <div className="flex items-center gap-3 px-3 py-2.5">{item}</div>}</li>;
                    })}
                  </ol>
                )}
              </div>
              {selectedDay.tasks.some((task) => !task.completed) && (
                <div className="border-t border-border px-5 py-4">
                  <Link href={firstIncompleteHref(selectedDay.tasks) ?? "/practice"} className="flex w-full items-center justify-center rounded-2xl bg-primary py-3.5 text-sm font-semibold text-white shadow-glow transition-all hover:bg-primary-dark">Start Today&apos;s Tasks</Link>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
