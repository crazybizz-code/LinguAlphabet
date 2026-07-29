import { motion } from "framer-motion";
import { BookOpenCheck, Clock } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import type { LastWeekSummary } from "@/lib/content/home";

/**
 * Execution Sprint P2 ("Weekly recap ritual") — see buildLastWeekSummary's
 * doc comment for why this needs no new schema or "already shown" state:
 * it's always showing last calendar week, which advances on its own.
 */
export function WeeklyRecapCard({ summary }: { summary: LastWeekSummary }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.28 }}
      className="mt-6 rounded-[1.5rem] border border-border bg-bg-card p-6"
    >
      <div className="flex items-start gap-3">
        <Tuto pose="happy" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Last Week</p>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            Here&apos;s what you got done last week — a fresh week just started.
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-bg-muted p-4 text-center">
          <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-primary-lighter">
            <BookOpenCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <p className="mt-1.5 text-lg font-bold text-text-primary">{summary.completedCount}</p>
          <p className="text-xs text-text-tertiary">{summary.completedCount === 1 ? "lesson" : "lessons"} completed</p>
        </div>
        <div className="rounded-2xl border border-border bg-bg-muted p-4 text-center">
          <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-primary-lighter">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <p className="mt-1.5 text-lg font-bold text-text-primary">{Math.round(summary.totalMinutes)}</p>
          <p className="text-xs text-text-tertiary">minutes studied</p>
        </div>
      </div>
    </motion.section>
  );
}
