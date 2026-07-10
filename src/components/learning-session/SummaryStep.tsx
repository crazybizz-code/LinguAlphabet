"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { SESSION_STEP_CONTAINER, SESSION_STEP_CONTENT } from "./sessionStepLayout";
import type { LearningSessionContent } from "@/lib/learning-session/types";

export function SummaryStep({
  content,
  displayName,
  onNext,
}: {
  content: LearningSessionContent;
  displayName: string;
  onNext: () => void;
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
          <Tuto pose="pointing" size="md" animation="float" />
          <div className="flex-1 pt-1">
            <h2 className="text-lg font-bold text-text-primary">Great job, {displayName}!</h2>
            <p className="text-sm text-text-secondary">Here&apos;s a quick recap of what you just learned.</p>
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-bg-muted p-5 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-bold text-primary">
              {content.cefrLevel}
            </span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-text-primary">{content.title}</h3>
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-border bg-bg-card p-4">
            <Tuto pose="pointing" size="sm" />
            <p className="pt-0.5 text-sm leading-relaxed text-text-secondary">{content.summary}</p>
          </div>
          {content.topics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {content.topics.map((topic) => (
                <span key={topic} className="rounded-full border border-border bg-bg-card px-3 py-1.5 text-xs font-semibold text-text-secondary">
                  {topic}
                </span>
              ))}
            </div>
          )}
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-primary-light bg-primary-lighter p-4">
            <Tuto pose="happy" size="sm" />
            <p className="pt-0.5 text-sm leading-relaxed text-text-secondary">
              &ldquo;You listened well! Now let&apos;s review the key vocabulary from this session.&rdquo;
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Review Vocabulary
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}
