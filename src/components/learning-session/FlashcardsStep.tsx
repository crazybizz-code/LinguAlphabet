"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import type { LearningSessionContent } from "@/lib/learning-session/types";

export function FlashcardsStep({ content, onNext }: { content: LearningSessionContent; onNext: () => void }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState<number[]>([]);

  const total = content.vocabulary.length;
  const current = content.vocabulary[index];
  const isLast = index === total - 1;
  const allReviewed = reviewed.length === total;

  function handleNext() {
    setReviewed((prev) => (prev.includes(index) ? prev : [...prev, index]));
    if (!isLast) {
      setFlipped(false);
      setTimeout(() => setIndex((current) => current + 1), 200);
    }
  }

  function handleReviewAgain() {
    setIndex(0);
    setFlipped(false);
    setReviewed([]);
  }

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
          <h2 className="text-lg font-bold text-text-primary">Flashcards</h2>
          <p className="text-sm text-text-secondary">Tap the card to flip. Review each word!</p>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-center gap-2">
        {content.vocabulary.map((entry, cardIndex) => (
          <div
            key={entry.word}
            className={`h-1.5 max-w-16 flex-1 rounded-full transition-all duration-300 ${
              cardIndex < index ? "bg-primary" : cardIndex === index ? "bg-primary/60" : "bg-border"
            }`}
          />
        ))}
      </div>

      <div className="relative h-72 sm:h-80" style={{ perspective: "1000px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${index}-${flipped ? "back" : "front"}`}
            initial={{ opacity: 0, rotateY: flipped ? -180 : 0 }}
            animate={{ opacity: 1, rotateY: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setFlipped((value) => !value)}
            className="relative h-full w-full cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label={flipped ? `Definition of ${current.word}` : `Word: ${current.word}. Tap to reveal definition.`}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") setFlipped((value) => !value);
            }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] border border-border bg-bg-card p-8 text-center shadow-lg">
              {flipped ? (
                <>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">Definition</p>
                  <p className="text-lg leading-relaxed text-text-secondary">{current.definition}</p>
                  {current.example && <p className="mt-3 text-sm italic text-text-tertiary">&ldquo;{current.example}&rdquo;</p>}
                  <p className="mt-4 text-xs text-text-tertiary">Tap to flip back</p>
                </>
              ) : (
                <>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Word</p>
                  <p className="text-3xl font-bold text-text-primary">{current.word}</p>
                  {current.phonetic && <p className="mt-2 text-sm text-text-tertiary">{current.phonetic}</p>}
                  <p className="mt-4 text-xs text-text-tertiary">Tap to reveal definition</p>
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="mt-4 text-center text-sm font-medium text-text-tertiary">
        Card {index + 1} of {total}
      </p>

      <div className="mt-6 flex gap-3">
        {allReviewed ? (
          <>
            <button
              type="button"
              onClick={handleReviewAgain}
              className="flex items-center justify-center gap-2 rounded-2xl bg-bg-muted px-6 py-4 text-sm font-bold text-text-secondary transition-all hover:bg-border/60"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Review Again
            </button>
            <button
              type="button"
              onClick={onNext}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Start Quiz
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {isLast ? (
              <>
                <Check className="h-5 w-5" aria-hidden="true" />
                Finish Review
              </>
            ) : (
              <>
                Got it — Next
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </>
            )}
          </button>
        )}
      </div>

      {allReviewed && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 flex items-start gap-3 rounded-2xl border border-primary-light bg-primary-lighter p-4"
        >
          <Tuto pose="happy" size="sm" />
          <p className="pt-0.5 text-sm leading-relaxed text-text-secondary">
            &ldquo;Excellent! You&apos;ve reviewed all the words. Ready for a quick quiz to test your knowledge?&rdquo;
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
