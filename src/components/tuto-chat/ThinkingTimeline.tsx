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

const STEPS = {
  grammar: { key: "grammar", label: "Checking grammar rules", icon: SpellCheck, colorClassName: "bg-cat-3/10 text-cat-3" },
  vocabulary: { key: "vocabulary", label: "Looking up vocabulary", icon: BookOpen, colorClassName: "bg-cat-2/10 text-cat-2" },
  knowledge: {
    key: "knowledge",
    label: "Checking LinguABC's knowledge base",
    icon: Library,
    colorClassName: "bg-cat-5/10 text-cat-5",
  },
  personalization: {
    key: "personalization",
    label: "Personalizing for your level",
    icon: Sparkles,
    colorClassName: "bg-cat-4/10 text-cat-4",
  },
} as const satisfies Record<string, ThinkingStep>;

const STEP_INTERVAL_MS = 700;

function orderedSteps(focus: ThinkingFocus): ThinkingStep[] {
  if (focus === "grammar") return [STEPS.grammar, STEPS.knowledge, STEPS.vocabulary, STEPS.personalization];
  if (focus === "vocabulary") return [STEPS.vocabulary, STEPS.knowledge, STEPS.grammar, STEPS.personalization];
  if (focus === "article") return [STEPS.knowledge, STEPS.vocabulary, STEPS.grammar, STEPS.personalization];
  return [STEPS.knowledge, STEPS.grammar, STEPS.vocabulary, STEPS.personalization];
}

/**
 * Sprint UX-1 (Living Tuto): a cosmetic "what Tuto is doing" sequence
 * shown while waiting for a reply — not a literal trace of real tool
 * calls. The client has no visibility into which server-side tools
 * actually ran (Sprint 9's four knowledge-lookup tools aren't surfaced
 * over SSE, and this sprint doesn't touch the AI architecture to add
 * that), so this is styled as a teacher's natural preparation steps
 * rather than a real-time trace. Cycles every ~700ms; the caller
 * unmounts this the instant real content starts arriving.
 */
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
