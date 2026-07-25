"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fadeScaleIn, EASE } from "@/lib/motion/variants";

export type ConfidenceLevel = "low" | "medium" | "high";

interface ConfidenceOption {
  key: ConfidenceLevel;
  label: string;
  emoji: string;
}

const OPTIONS: ConfidenceOption[] = [
  { key: "low", label: "Still learning", emoji: "🌱" },
  { key: "medium", label: "Getting there", emoji: "🙂" },
  { key: "high", label: "Confident", emoji: "💪" },
];

const RESPONSE_COPY: Record<ConfidenceLevel, string> = {
  low: "That's okay — practice is how it clicks. We'll keep working on this together.",
  medium: "Nice progress! A little more practice and this will feel natural.",
  high: "Great! Let's keep that momentum going.",
};

/**
 * Sprint UX-3 (Adaptive Teaching): a lightweight self-check after a
 * lesson moment (currently shown once a MiniQuiz is answered) — entirely
 * local, like the quiz itself; never sent to the AI or added to
 * conversation history, since there's no real place for this signal to
 * go without touching the backend/learner profile this sprint excludes.
 */
export function ConfidenceSelector({ onSelect }: { onSelect?: (level: ConfidenceLevel) => void }) {
  const [picked, setPicked] = useState<ConfidenceLevel | null>(null);

  function handlePick(level: ConfidenceLevel) {
    setPicked(level);
    onSelect?.(level);
  }

  return (
    <motion.div variants={fadeScaleIn} initial="hidden" animate="visible" className="rounded-2xl border border-border bg-bg-muted p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-text-tertiary">How confident do you feel?</p>
      <AnimatePresence mode="wait">
        {picked ? (
          <motion.p
            key="response"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE.out }}
            className="text-sm leading-relaxed text-text-secondary"
          >
            {RESPONSE_COPY[picked]}
          </motion.p>
        ) : (
          <motion.div key="options" initial={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-2">
            {OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => handlePick(option.key)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-bg-card px-3.5 py-2 text-xs font-bold text-text-primary transition-all hover:border-primary/40 hover:bg-primary-lighter active:scale-[0.97]"
              >
                <span aria-hidden="true">{option.emoji}</span>
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
