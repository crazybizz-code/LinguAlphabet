"use client";

import { AnimatePresence, motion } from "framer-motion";
import { EASE } from "@/lib/motion/variants";
import type { CefrLevel } from "@/ai/context";

/**
 * Sprint UX-3 (Adaptive Teaching): a real signal, not a fabricated one —
 * `level` comes straight from the same `userLevel` already threaded
 * through TutoContextInput at each call site (content.cefrLevel for
 * article/vocabulary flows). Renders nothing when it's null, exactly
 * like LearningContext's own fields never fabricate a value that wasn't
 * provided. Colored per the existing --color-level-* design tokens
 * (globals.css) rather than a new palette.
 */
const LEVEL_COLOR_VAR: Record<CefrLevel, string> = {
  A1: "var(--color-level-a1)",
  A2: "var(--color-level-a2)",
  B1: "var(--color-level-b1)",
  B2: "var(--color-level-b2)",
  C1: "var(--color-level-c1)",
  C2: "var(--color-level-c2)",
};

export function AdaptiveLevelBadge({ level }: { level?: CefrLevel | null }) {
  return (
    <AnimatePresence mode="wait">
      {level && (
        <motion.span
          key={level}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.25, ease: EASE.out }}
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide"
          style={{ borderColor: LEVEL_COLOR_VAR[level], color: LEVEL_COLOR_VAR[level] }}
        >
          {level} level
        </motion.span>
      )}
    </AnimatePresence>
  );
}
