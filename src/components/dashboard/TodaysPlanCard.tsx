"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen, Headphones, BookCheck, Mic, PenLine, BarChart2, ListChecks, ChevronRight,
} from "lucide-react";

export interface PlanTask {
  id: string;
  taskType: string;
  title: string;
  estimatedMinutes: number | null;
  completed: boolean;
  contentItemId: string | null;
}

export interface TodaysPlanCardProps {
  tasks: PlanTask[];
  dayNumber: number;
  theme: string | null;
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

const TASK_COLORS: Record<string, string> = {
  podcast: "bg-blue-50 text-blue-600",
  listening_practice: "bg-blue-50 text-blue-600",
  article: "bg-emerald-50 text-emerald-600",
  reading_practice: "bg-emerald-50 text-emerald-600",
  vocabulary: "bg-violet-50 text-violet-600",
  grammar: "bg-amber-50 text-amber-600",
  weak_area: "bg-orange-50 text-orange-600",
  quiz: "bg-rose-50 text-rose-600",
  review: "bg-teal-50 text-teal-600",
  mock: "bg-primary/5 text-primary",
};

export function TodaysPlanCard({ tasks, dayNumber, theme }: TodaysPlanCardProps) {
  if (tasks.length === 0) return null;

  const completedCount = tasks.filter((t) => t.completed).length;
  const allDone = completedCount === tasks.length;
  const progressPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="mt-5 px-5 sm:px-8"
      aria-labelledby="todays-plan-heading"
    >
      <div className="rounded-card bg-bg-card shadow-card">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3 sm:p-6 sm:pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Day {dayNumber} · Today&apos;s Plan
            </p>
            {theme && (
              <h2 id="todays-plan-heading" className="mt-0.5 font-heading text-lg font-bold leading-snug text-text-primary">
                {theme}
              </h2>
            )}
          </div>
          {allDone ? (
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              Complete
            </span>
          ) : (
            <span className="text-sm font-medium text-text-secondary">
              {completedCount}/{tasks.length}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mx-5 sm:mx-6">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Task list */}
        <ul className="mt-3 divide-y divide-border/40">
          {tasks.map((task, idx) => {
            const Icon = TASK_ICONS[task.taskType] ?? ListChecks;
            const colorClass = TASK_COLORS[task.taskType] ?? "bg-primary/5 text-primary";

            return (
              <li key={task.id}>
                <div className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  {/* Icon chip */}
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>

                  {/* Task info */}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-semibold ${task.completed ? "text-text-secondary line-through" : "text-text-primary"}`}>
                      {task.title}
                    </p>
                    {task.estimatedMinutes && (
                      <p className="text-xs text-text-secondary">{task.estimatedMinutes} min</p>
                    )}
                  </div>

                  {/* Status / action */}
                  {task.completed ? (
                    <span className="h-5 w-5 flex-shrink-0 rounded-full bg-success/20 text-success flex items-center justify-center">
                      <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3" aria-label="Done">
                        <path d="M10 3L5 9 2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </span>
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-secondary" aria-hidden="true" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        <div className="border-t border-border/40 p-4 sm:p-5">
          <Link
            href="/plan"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-bg-surface px-4 py-2.5 text-sm font-semibold text-text-primary transition-all hover:bg-border/20"
          >
            View 28-Day Plan
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
