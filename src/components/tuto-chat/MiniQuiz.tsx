"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeScaleIn, EASE } from "@/lib/motion/variants";
import type { MiniQuizQuestion } from "@/lib/tuto-chat/miniQuizBank";

/** Sprint UX-2: a self-contained "quick check" — locally scored, never sent to the AI or added to the conversation history. */
export function MiniQuiz({ quiz, onAnswered }: { quiz: MiniQuizQuestion; onAnswered: (correct: boolean) => void }) {
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(index: number) {
    if (selected !== null) return;
    setSelected(index);
    onAnswered(index === quiz.correctIndex);
  }

  return (
    <motion.div variants={fadeScaleIn} initial="hidden" animate="visible" className="rounded-2xl border border-border bg-bg-muted p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-text-tertiary">
        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
        Quick check
      </div>
      <p className="mb-3 text-sm font-semibold text-text-primary">{quiz.question}</p>
      <div className="flex flex-col gap-2">
        {quiz.options.map((option, index) => {
          const isSelected = selected === index;
          const isCorrectOption = index === quiz.correctIndex;
          const revealed = selected !== null;
          return (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(index)}
              disabled={revealed}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition-all",
                !revealed && "border-border bg-bg-card text-text-primary hover:border-primary/40",
                revealed && isCorrectOption && "border-success/40 bg-success-soft text-text-primary",
                // Sprint UX-3 (gentle mistake feedback): warning/amber, not
                // danger/red — a wrong answer should still read clearly as
                // "not this one," just without the harsher error tone.
                revealed && isSelected && !isCorrectOption && "border-warning/40 bg-warning/10 text-text-primary",
                revealed && !isSelected && !isCorrectOption && "border-border bg-bg-card text-text-tertiary",
              )}
            >
              {option}
              {revealed && isCorrectOption && <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
              {revealed && isSelected && !isCorrectOption && <X className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE.out }}
          className="mt-3 text-xs font-medium text-text-secondary"
        >
          {selected === quiz.correctIndex
            ? "Nice work — that's it!"
            : "So close! Here's the one that fits best — you'll get it next time."}
        </motion.p>
      )}
    </motion.div>
  );
}
