"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { recordVocabularyReview } from "@/lib/vocabulary/review";
import type { DueVocabularyWord } from "@/lib/vocabulary/review";

/**
 * The lightweight daily review flow spaced-repetition needs (Execution
 * Sprint P1): one word at a time, tap to reveal, then an honest
 * "Still learning" / "Got it" split — unlike FlashcardsStep (which just
 * paces through a lesson's word list), this is the one place a recall
 * outcome actually gets recorded, advancing or resetting that word's
 * Leitner box (src/lib/vocabulary/spaced-repetition.ts). Deliberately its
 * own small flow rather than reusing FlashcardsStep directly — that
 * component is tied to LearningSessionContent and has no recall-outcome
 * concept to hang this on.
 */
export function VocabularyReviewView({ words }: { words: DueVocabularyWord[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(words.length === 0);

  const total = words.length;
  const current = words[index];
  const isLast = index === total - 1;

  function respond(wasCorrect: boolean) {
    // Fire-and-forget: recording the outcome must never block moving on to
    // the next word — a failed write here just means that one word's box
    // doesn't advance/reset until it comes up due again, not a stuck screen.
    recordVocabularyReview(current.word, wasCorrect).catch(() => {});
    if (isLast) {
      setDone(true);
    } else {
      setFlipped(false);
      setIndex((value) => value + 1);
    }
  }

  if (done || total === 0) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5 py-12 text-center">
        <Tuto pose="celebrating" size="lg" animation="float" priority />
        <h1 className="mt-6 text-2xl font-bold text-text-primary">
          {total === 0 ? "Nothing due right now" : "Review complete!"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          {total === 0
            ? "Save a word from any lesson's dictionary and it'll come back here when it's time to review."
            : `You reviewed ${total} ${total === 1 ? "word" : "words"}. Tuto scheduled each one for its next review automatically.`}
        </p>
        <Link
          href="/dashboard"
          className="mt-8 flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Back to Dashboard
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-10 sm:py-14">
      <div className="mb-6 flex items-start gap-3">
        <Tuto pose="pointing" size="md" animation="float" />
        <div className="flex-1 pt-1">
          <h2 className="text-lg font-bold text-text-primary">Word Review</h2>
          <p className="text-sm text-text-secondary">Tap the card, then say how well you remembered it.</p>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-center gap-2">
        {words.map((word, cardIndex) => (
          <div
            key={word.word}
            className={`h-1.5 max-w-16 flex-1 rounded-full transition-all duration-300 ${
              cardIndex < index ? "bg-primary" : cardIndex === index ? "bg-primary/60" : "bg-border"
            }`}
          />
        ))}
      </div>

      <div className="relative h-72 sm:h-80">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${index}-${flipped ? "back" : "front"}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setFlipped((value) => !value)}
            className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center rounded-[2rem] border border-border bg-bg-card p-6 text-center shadow-lg sm:p-8"
            role="button"
            tabIndex={0}
            aria-label={flipped ? `Definition of ${current.word}` : `Word: ${current.word}. Tap to reveal definition.`}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") setFlipped((value) => !value);
            }}
          >
            {flipped ? (
              <>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">Definition</p>
                {current.definition && <p className="text-lg leading-relaxed text-text-secondary">{current.definition}</p>}
                {current.translation && <p className="mt-2 text-sm font-medium text-text-primary">{current.translation}</p>}
                {current.example && <p className="mt-3 text-sm italic text-text-tertiary">&ldquo;{current.example}&rdquo;</p>}
              </>
            ) : (
              <>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Word</p>
                <p className="text-3xl font-bold text-text-primary">{current.word}</p>
                {current.phonetic && <p className="mt-2 text-sm text-text-tertiary">{current.phonetic}</p>}
                <p className="mt-4 text-xs text-text-tertiary">Tap to reveal definition</p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="mt-4 text-center text-sm font-medium text-text-tertiary">
        Word {index + 1} of {total}
      </p>

      {flipped && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => respond(false)}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-bg-muted px-4 py-4 text-sm font-bold text-text-secondary transition-all hover:bg-border/60"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Still learning
          </button>
          <button
            type="button"
            onClick={() => respond(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-sm font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Got it
          </button>
        </motion.div>
      )}
    </div>
  );
}
