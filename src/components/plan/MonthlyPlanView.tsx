"use client";

import { motion } from "framer-motion";
import {
  BookOpen, Headphones, BookCheck, Mic, PenLine, BarChart2, ListChecks, Calendar,
  ChevronLeft, ChevronRight as ChevronRightIcon,
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

const SKILL_DOT: Record<string, string> = {
  listening: "bg-blue-400",
  reading: "bg-emerald-400",
  vocabulary: "bg-violet-400",
  grammar: "bg-amber-400",
  mixed: "bg-primary",
};

function weekLabel(weekNum: number) {
  const labels = [
    "Foundation",
    "Skill Building",
    "Integration",
    "Assessment Prep",
  ];
  return labels[weekNum - 1] ?? `Week ${weekNum}`;
}

export function MonthlyPlanView({
  assessedLevel,
  startsOn,
  weakAreas,
  days,
  today,
}: MonthlyPlanViewProps) {
  const [selectedDayId, setSelectedDayId] = useState<string | null>(
    days.find((d) => d.planDate === today)?.id ?? days[0]?.id ?? null,
  );

  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null;

  const completedDays = days.filter((d) => d.tasks.length > 0 && d.tasks.every((t) => t.completed)).length;

  // Group days by week
  const weeks = [1, 2, 3, 4].map((w) => ({
    weekNum: w,
    days: days.slice((w - 1) * 7, w * 7),
  }));

  return (
    <div className="mx-auto max-w-3xl pb-10">
      {/* Header */}
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

      {/* Week grids */}
      {weeks.map(({ weekNum, days: weekDays }, wi) => (
        <motion.section
          key={weekNum}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 * wi }}
          className="mt-6 px-5 sm:px-8"
          aria-labelledby={`week-${weekNum}-heading`}
        >
          <div className="mb-2 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
            <h2 id={`week-${weekNum}-heading`} className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Week {weekNum} · {weekLabel(weekNum)}
            </h2>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((day) => {
              const isToday = day.planDate === today;
              const isPast = day.planDate < today;
              const allTasksDone = day.tasks.length > 0 && day.tasks.every((t) => t.completed);
              const someTasksDone = day.tasks.some((t) => t.completed);
              const isSelected = day.id === selectedDayId;

              const skillFocus = day.tasks[0]?.skillFocus ?? "mixed";
              const dotClass = SKILL_DOT[skillFocus] ?? SKILL_DOT.mixed;

              return (
                <button
                  key={day.id}
                  onClick={() => setSelectedDayId(day.id)}
                  aria-label={`Day ${day.dayNumber}${isToday ? " (today)" : ""}`}
                  aria-pressed={isSelected}
                  className={[
                    "flex flex-col items-center gap-1 rounded-xl p-1.5 transition-all",
                    isSelected ? "bg-primary text-white shadow-glow" : "hover:bg-border/40",
                    isToday && !isSelected ? "ring-2 ring-primary ring-offset-1" : "",
                  ].join(" ")}
                >
                  <span className={`text-xs font-bold ${isSelected ? "text-white" : isPast && !allTasksDone ? "text-text-secondary" : "text-text-primary"}`}>
                    {day.dayNumber}
                  </span>
                  {allTasksDone ? (
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-success"}`} />
                  ) : someTasksDone ? (
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white/60" : "bg-warning"}`} />
                  ) : (
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white/40" : dotClass}`} />
                  )}
                </button>
              );
            })}
          </div>
        </motion.section>
      ))}

      {/* Day detail panel */}
      {selectedDay && (
        <motion.section
          key={selectedDay.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-6 px-5 sm:px-8"
          aria-labelledby="day-detail-heading"
        >
          <div className="rounded-card bg-bg-card shadow-card">
            <div className="border-b border-border/40 px-5 py-4 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Day {selectedDay.dayNumber} · {selectedDay.planDate === today ? "Today" : selectedDay.planDate}
              </p>
              {selectedDay.theme && (
                <h2 id="day-detail-heading" className="mt-0.5 font-heading text-lg font-bold text-text-primary">
                  {selectedDay.theme}
                </h2>
              )}
              {selectedDay.estimatedMinutes && (
                <p className="mt-0.5 text-xs text-text-secondary">
                  ~{selectedDay.estimatedMinutes} min
                </p>
              )}
            </div>

            <ul className="divide-y divide-border/40">
              {selectedDay.tasks.map((task) => {
                const Icon = TASK_ICONS[task.taskType] ?? ListChecks;
                return (
                  <li key={task.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                    <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                      task.completed ? "bg-success/10 text-success" : "bg-border/40 text-text-secondary"
                    }`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${task.completed ? "text-text-secondary line-through" : "text-text-primary"}`}>
                        {task.title}
                      </p>
                      {task.estimatedMinutes && (
                        <p className="text-xs text-text-secondary">{task.estimatedMinutes} min</p>
                      )}
                    </div>
                    {task.completed && (
                      <svg viewBox="0 0 12 12" className="h-4 w-4 flex-shrink-0 text-success" aria-label="Done">
                        <path d="M10 3L5 9 2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </motion.section>
      )}
    </div>
  );
}
