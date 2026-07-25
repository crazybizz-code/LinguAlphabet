"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Flame, Target, Zap } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { SESSION_STEP_CONTAINER, SESSION_STEP_CONTENT } from "./sessionStepLayout";
import type { CompleteMissionResult } from "@/lib/learning-session/complete-mission";

const STREAK_LABEL: Record<CompleteMissionResult["streakStatus"], string> = {
  started: "Streak started!",
  reset: "Fresh start today",
  grew: "Day Streak",
  same: "Day Streak",
};

export function CompleteStep({
  displayName,
  score,
  totalQuestions,
  result,
}: {
  displayName: string;
  score: number;
  totalQuestions: number;
  result: CompleteMissionResult;
}) {
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  const message =
    percentage >= 80
      ? `"Outstanding! You scored ${score} out of ${totalQuestions}. Your English is getting sharper every day. Keep this momentum going!"`
      : percentage >= 50
        ? `"Good effort! You scored ${score} out of ${totalQuestions}. You're on the right track — review the vocabulary and try again tomorrow!"`
        : `"Don't worry, ${displayName}! You scored ${score} out of ${totalQuestions}. Every expert was once a beginner. Let's review and come back stronger!"`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={SESSION_STEP_CONTAINER}
    >
      <div className={SESSION_STEP_CONTENT}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-[#FF8C33] p-8 text-center shadow-glow sm:p-10"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.6, delay: 0.2, type: "spring" }}
            className="relative mx-auto mb-4"
          >
            <Tuto pose="celebrating" size="xl" animation="float" priority />
          </motion.div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Mission Complete!</h2>
          <p className="mt-2 text-white/80">Amazing work today, {displayName}!</p>
          <div className="mt-4 flex flex-col items-center gap-2">
            {/* First Session Celebration — the single biggest moment in a new
                learner's lifecycle deserves its own callout, not the same
                treatment as session #500. Reuses the exact level-up pill
                language rather than a new visual, and stacks independently
                if a first session also happens to level someone up. */}
            {result.isFirstSession && (
              <motion.p
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className="relative inline-block rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold text-white"
              >
                🌱 Your First Session — Welcome to your journey!
              </motion.p>
            )}
            {result.leveledUp && (
              <motion.p
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className="relative inline-block rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold text-white"
              >
                🎉 Level Up! You&apos;re now Level {result.newLevel}
              </motion.p>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 grid grid-cols-3 gap-3"
        >
          <div className="rounded-2xl border border-border bg-bg-card p-4 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-lighter">
              <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <p className="mt-2 text-xl font-bold text-text-primary">+{result.xpEarned}</p>
            <p className="text-xs text-text-tertiary">XP Earned</p>
          </div>
          <div className="rounded-2xl border border-border bg-bg-card p-4 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-lighter">
              <Flame className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <p className="mt-2 text-xl font-bold text-text-primary">{result.newStreak}</p>
            {/* Streak Truth: the same tile, but its caption now says what
                actually happened (started / reset / continuing) instead of
                a bare "Day Streak" label regardless of whether the streak
                just reset from a much higher number — see StreakStatus. */}
            <p className="text-xs text-text-tertiary">{STREAK_LABEL[result.streakStatus]}</p>
          </div>
          <div className="rounded-2xl border border-border bg-bg-card p-4 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-lighter">
              <Target className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <p className="mt-2 text-xl font-bold text-text-primary">{percentage}%</p>
            <p className="text-xs text-text-tertiary">Quiz Score</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-6 flex items-start gap-3 rounded-2xl border border-primary-light bg-primary-lighter p-5"
        >
          <Tuto pose="celebrating" size="md" />
          <p className="pt-1 text-sm leading-relaxed text-text-secondary">{message}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-6 flex flex-col gap-3"
        >
          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
          >
            Back to Home
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link
            href="/explore"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-bg-card py-4 text-base font-bold text-text-secondary transition-all hover:bg-bg-muted"
          >
            Explore More Content
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
