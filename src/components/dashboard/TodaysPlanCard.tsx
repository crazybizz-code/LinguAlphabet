"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen, Headphones, BookCheck, Mic, PenLine, BarChart2, ListChecks, ChevronRight, ArrowRight,
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

function contentHref(task: PlanTask): string | null {
  if (!task.contentItemId) return null;
  if (task.taskType === "podcast" || task.taskType === "listening_practice") {
    return `/podcast/${task.contentItemId}/play`;
  }
  if (task.taskType === "article" || task.taskType === "reading_practice") {
    return `/article/${task.contentItemId}`;
  }
  return null;
}

export function TodaysPlanCard({ tasks, dayNumber, theme }: TodaysPlanCardProps) {
  if (tasks.length === 0) return null;

  const completedCount = tasks.filter((t) => t.completed).length;
  const allDone = completedCount === tasks.length;
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0);

  const firstActionable = tasks.find((t) => !t.completed);
  const continueHref = firstActionable ? (contentHref(firstActionable) ?? "/plan") : "/plan";

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="mt-5 px-5 sm:px-8"
      aria-labelledby="todays-plan-heading"
    >
      <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Day {dayNumber}
            </p>
            <h2 id="todays-plan-heading" className="mt-0.5 font-heading text-lg font-bold text-text-primary">
              {theme ?? "Today's Plan"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {allDone ? (
              <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                Complete
              </span>
            ) : (
              <span className="text-sm font-medium text-text-secondary">
                {completedCount}/{tasks.length}
              </span>
            )}
            <Link
              href="/plan"
              className="flex items-center gap-0.5 text-xs font-semibold text-[#FF6B00] hover:underline"
            >
              View Full Plan
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Task list */}
        <ul className="mt-4 flex flex-col gap-2">
          {tasks.map((task) => {
            const Icon = TASK_ICONS[task.taskType] ?? ListChecks;
            const href = contentHref(task);

            const content = (
              <div
                className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                  task.completed
                    ? "border-green-100 bg-green-50/40"
                    : "border-slate-100 bg-[#F8FAFC] hover:bg-orange-50/30"
                }`}
              >
                {/* Icon chip — all orange per Base44 */}
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-50">
                  <Icon className="h-4 w-4 text-[#FF6B00]" aria-hidden="true" />
                </span>

                {/* Task info */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold ${
                      task.completed ? "text-text-secondary line-through" : "text-text-primary"
                    }`}
                  >
                    {task.title}
                  </p>
                  {task.estimatedMinutes && (
                    <p className="text-xs text-text-secondary">{task.estimatedMinutes} min</p>
                  )}
                </div>

                {/* Status */}
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
            );

            return (
              <li key={task.id}>
                {href && !task.completed ? (
                  <Link href={href}>{content}</Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          {totalMinutes > 0 && (
            <p className="text-sm text-text-secondary">
              Total: <span className="font-semibold text-text-primary">{totalMinutes} min</span>
            </p>
          )}
          {!allDone && (
            <Link
              href={continueHref}
              className="ml-auto flex items-center gap-2 rounded-2xl bg-[#FF6B00] px-6 py-3 text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </motion.section>
  );
}
