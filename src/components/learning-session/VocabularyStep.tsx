"use client";

import { motion } from "framer-motion";
import { ArrowRight, BookOpen } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import type { LearningSessionContent } from "@/lib/learning-session/types";

export function VocabularyStep({ content, onNext }: { content: LearningSessionContent; onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto max-w-2xl px-5 py-6 sm:px-8"
    >
      <div className="mb-6 flex items-start gap-3">
        <Tuto pose="pointing" size="md" animation="float" />
        <div className="flex-1 pt-1">
          <h2 className="text-lg font-bold text-text-primary">Key Vocabulary</h2>
          <p className="text-sm text-text-secondary">Let&apos;s review the important words from this session.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {content.vocabulary.map((entry, index) => (
          <motion.div
            key={entry.word}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.08 }}
            className="flex items-start gap-4 rounded-2xl border border-border bg-bg-card p-4 transition-all hover:shadow-md"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter">
              <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="font-bold text-text-primary">{entry.word}</p>
                {entry.phonetic && <span className="text-xs text-text-tertiary">{entry.phonetic}</span>}
                {entry.pos && (
                  <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                    {entry.pos}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-text-secondary">{entry.definition}</p>
              {entry.example && <p className="mt-1 text-xs italic text-text-tertiary">&ldquo;{entry.example}&rdquo;</p>}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary-light bg-primary-lighter p-4">
        <Tuto pose="happy" size="sm" />
        <p className="pt-0.5 text-sm leading-relaxed text-text-secondary">
          &ldquo;These are powerful words! Take a moment to read each one. Ready to practice with flashcards?&rdquo;
        </p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
      >
        Start Flashcards
        <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </motion.div>
  );
}
