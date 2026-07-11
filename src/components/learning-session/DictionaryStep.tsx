"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { ClickableText } from "@/components/vocabulary/ClickableText";
import { DictionaryOverlay } from "@/components/vocabulary/DictionaryOverlay";
import { SESSION_STEP_CONTAINER, SESSION_STEP_CONTENT } from "./sessionStepLayout";
import type { LearningSessionContent } from "@/lib/learning-session/types";
import type { VocabularyEntry } from "@/types/content";

/**
 * The Live Dictionary step — the same article body as Reading, now with
 * every word tappable via ClickableText + DictionaryOverlay, the exact
 * stack the Podcast Player already uses on its transcript (PlayerStep.tsx).
 * Ungated: looking words up is optional practice, not a required activity
 * the way reading the whole article is.
 */
export function DictionaryStep({ content, onNext }: { content: LearningSessionContent; onNext: () => void }) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState("");

  const handleWordClick = useCallback((word: string, context: string) => {
    setSelectedWord(word);
    setSelectedContext(context);
  }, []);

  function findVocabularyEntry(word: string): VocabularyEntry | null {
    const normalized = word.toLowerCase();
    return content.vocabulary.find((entry) => entry.word.toLowerCase() === normalized) ?? null;
  }

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
          <Tuto pose="thinking" size="md" animation="float" />
          <div className="flex-1 pt-1">
            <h2 className="text-lg font-bold text-text-primary">Live Dictionary</h2>
            <p className="text-sm text-text-secondary">Tap any word below to look it up.</p>
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-bg-muted p-5 sm:p-8">
          <div className="flex flex-col gap-4">
            {content.paragraphs.map((paragraph, index) => (
              <p key={index} className="text-base leading-relaxed text-text-secondary">
                <ClickableText text={paragraph} onWordClick={handleWordClick} />
              </p>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Continue to Summary
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <DictionaryOverlay
        open={selectedWord !== null}
        word={selectedWord ?? ""}
        context={selectedContext}
        entry={selectedWord ? findVocabularyEntry(selectedWord) : null}
        sourceContentId={content.contentId}
        onClose={() => setSelectedWord(null)}
      />
    </motion.div>
  );
}
