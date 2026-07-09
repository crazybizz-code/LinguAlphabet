"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { SESSION_STEP_CONTAINER, SESSION_STEP_CONTENT } from "./sessionStepLayout";
import type { LearningSessionContent } from "@/lib/learning-session/types";

export function ReflectionStep({
  content,
  onNext,
}: {
  content: LearningSessionContent;
  onNext: (reflectionText: string) => void;
}) {
  const [text, setText] = useState("");

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
            <h2 className="text-lg font-bold text-text-primary">A Moment to Reflect</h2>
            <p className="text-sm text-text-secondary">There&apos;s no wrong answer here — this is just for you.</p>
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-bg-muted p-6 sm:p-8">
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-bg-card p-4">
            <Tuto pose="thinking" size="sm" />
            <p className="pt-0.5 text-sm leading-relaxed text-text-secondary">{content.reflectionPrompt}</p>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Write a few words (optional)..."
            rows={4}
            aria-label="Your reflection"
            className="mt-4 w-full resize-none rounded-2xl border border-border bg-bg-card p-4 text-sm text-text-primary placeholder:text-text-tertiary transition-all focus:border-primary focus:outline-none focus:ring-4 focus:ring-focus-ring"
          />
        </div>

        <button
          type="button"
          onClick={() => onNext(text)}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Continue
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}
