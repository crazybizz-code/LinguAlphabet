"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { SpellCheck, BookOpen, Library, Sparkles, type LucideIcon } from "lucide-react";
import { ToolActivityCard } from "./ToolActivityCard";

export type ThinkingFocus = "grammar" | "vocabulary" | "article" | null;

interface ThinkingStep {
  key: string;
  label: string;
  icon: LucideIcon;
  colorClassName: string;
}

/**
 * Sprint UX-3.1 (Polish): the client genuinely knows exactly one true
 * thing about why this conversation exists — the real context that opened
 * it (thinkingFocus: which screen/flow triggered the chat) — and nothing
 * about which tools the server actually ran (Sprint 9's knowledge-lookup
 * tools aren't surfaced over SSE). The previous version cycled through
 * four specific-sounding tool claims ("Checking grammar rules", "Checking
 * LinguABC's knowledge base"...) as if all four genuinely happened on
 * every turn — that wasn't true and read as theater the moment a user
 * noticed a mismatch (e.g. a grammar question inside the vocabulary flow
 * still showing "Looking up vocabulary"). Now only the ONE step that's
 * actually true for this context gets specific copy; every other step is
 * honest, generic "a teacher is thinking" language that never claims an
 * unverified specific activity.
 */
const SPECIFIC_STEP: Record<Exclude<ThinkingFocus, null>, ThinkingStep> = {
  grammar: { key: "grammar", label: "Checking the grammar rule", icon: SpellCheck, colorClassName: "bg-cat-3/10 text-cat-3" },
  vocabulary: { key: "vocabulary", label: "Looking up this word", icon: BookOpen, colorClassName: "bg-cat-2/10 text-cat-2" },
  article: { key: "article", label: "Reviewing the article", icon: Library, colorClassName: "bg-cat-5/10 text-cat-5" },
};

const GENERIC_STEPS: ThinkingStep[] = [
  { key: "generic-1", label: "Thinking it through…", icon: Sparkles, colorClassName: "bg-cat-4/10 text-cat-4" },
  { key: "generic-2", label: "Preparing an explanation…", icon: Sparkles, colorClassName: "bg-cat-4/10 text-cat-4" },
  { key: "generic-3", label: "Considering the best way to explain this…", icon: Sparkles, colorClassName: "bg-cat-4/10 text-cat-4" },
  { key: "generic-4", label: "Putting the answer together…", icon: Sparkles, colorClassName: "bg-cat-4/10 text-cat-4" },
];

const STEP_INTERVAL_MS = 700;

/** The one true step (if any) leads; the rest are generic, never fabricated specifics. */
function orderedSteps(focus: ThinkingFocus): ThinkingStep[] {
  if (!focus) return GENERIC_STEPS;
  return [SPECIFIC_STEP[focus], ...GENERIC_STEPS.slice(0, 3)];
}
export function ThinkingTimeline({ focus = null }: { focus?: ThinkingFocus }) {
  const steps = orderedSteps(focus);
  const [index, setIndex] = useState(0);
  const [trackedFocus, setTrackedFocus] = useState(focus);

  // Restart the sequence during render when the focus hint changes —
  // React's documented pattern for adjusting state from changed props
  // (already used in this codebase, e.g. DictionaryOverlay's word-change
  // reset), so this never triggers a synchronous setState-in-effect chain.
  if (trackedFocus !== focus) {
    setTrackedFocus(focus);
    setIndex(0);
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % steps.length);
    }, STEP_INTERVAL_MS);
    return () => clearInterval(interval);
    // Interval cadence and step count never change after mount — only the
    // active index (advanced via the functional updater above) does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = steps[index];

  return (
    <div className="flex items-center gap-2 py-1">
      <AnimatePresence mode="wait">
        <ToolActivityCard key={current.key} icon={current.icon} label={current.label} colorClassName={current.colorClassName} />
      </AnimatePresence>
    </div>
  );
}
