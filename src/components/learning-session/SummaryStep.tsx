"use client";

import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CheckCircle2, Target } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { SESSION_STEP_CONTAINER, SESSION_STEP_CONTENT } from "./sessionStepLayout";
import type { LearningSessionContent } from "@/lib/learning-session/types";

/**
 * The post-quiz recap — the session's reward screen, shown after all the
 * work is done (reading/listening, vocabulary, flashcards, quiz) and
 * right before the Complete celebration. Everything on it is real
 * session data: the AI summary, key takeaways, the vocabulary actually
 * reviewed, and the learner's real quiz score. "Finish Session" is what
 * commits the completion (XP/streak/progress) — wired by
 * LearningSessionView with retry + fallback so it can never dead-end.
 */
export function SummaryStep({
  content,
  displayName,
  quizScore,
  quizTotal,
  finishing,
  onFinish,
}: {
  content: LearningSessionContent;
  displayName: string;
  quizScore: number;
  quizTotal: number;
  finishing: boolean;
  onFinish: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={SESSION_STEP_CONTAINER}
    >
      <div className={SESSION_STEP_CONTENT}>
        <div className="mb-6 flex items-start gap-3">
          <Tuto pose="happy" size="md" animation="float" />
          <div className="flex-1 pt-1">
            <h2 className="text-lg font-bold text-text-primary">Great job, {displayName}!</h2>
            <p className="text-sm text-text-secondary">Here&apos;s everything you covered in this session.</p>
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-bg-muted p-5 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-bold text-primary">
              {content.cefrLevel}
            </span>
            {content.topics[0] && (
              <span className="rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-semibold text-text-secondary">
                {content.topics[0]}
              </span>
            )}
          </div>
          <h3 className="mb-4 text-xl font-bold text-text-primary">{content.title}</h3>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-bg-card p-4 text-center">
              <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-primary-lighter">
                <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              <p className="mt-1.5 text-lg font-bold text-text-primary">{content.vocabulary.length}</p>
              <p className="text-xs text-text-tertiary">Words learned</p>
            </div>
            <div className="rounded-2xl border border-border bg-bg-card p-4 text-center">
              <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-primary-lighter">
                <Target className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              <p className="mt-1.5 text-lg font-bold text-text-primary">
                {quizTotal > 0 ? `${quizScore}/${quizTotal}` : "—"}
              </p>
              <p className="text-xs text-text-tertiary">Quiz score</p>
            </div>
          </div>

          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-border bg-bg-card p-4">
            <Tuto pose="pointing" size="sm" />
            <p className="pt-0.5 text-sm leading-relaxed text-text-secondary">{content.summary}</p>
          </div>

          {content.takeaways.length > 0 && (
            <div className="mb-4 rounded-2xl border border-border bg-bg-card p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-tertiary">Key takeaways</p>
              <ul className="flex flex-col gap-2">
                {content.takeaways.map((takeaway, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {takeaway}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {content.vocabulary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {content.vocabulary.map((entry) => (
                <span
                  key={entry.word}
                  className="rounded-full border border-border bg-bg-card px-3 py-1.5 text-xs font-semibold text-text-secondary"
                >
                  {entry.word}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onFinish}
          disabled={finishing}
          aria-disabled={finishing}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
        >
          {finishing ? "Saving your progress…" : "Finish Session"}
          {!finishing && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </motion.div>
  );
}
