"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Zap } from "lucide-react";
import { badgePop } from "@/lib/motion/variants";

/**
 * Sprint UX-2: a presentational reward flourish only — not connected to
 * the learner's real XP total (Supabase-backed, untouched by this
 * frontend-only sprint). Mirrors the app's own existing "XP Earned"
 * visual language (CompleteStep.tsx: a Zap icon in a primary-lighter
 * chip) instead of inventing a new one.
 */
export function XPBurst({ trigger, amount = 10 }: { trigger: number; amount?: number }) {
  const [visible, setVisible] = useState(false);
  const [trackedTrigger, setTrackedTrigger] = useState(trigger);

  // Show instantly during render when a new (nonzero) trigger arrives —
  // React's documented pattern for adjusting state from changed props
  // (already used in this codebase, e.g. DictionaryOverlay's word-change
  // reset), so this never triggers a synchronous setState-in-effect chain.
  if (trigger !== trackedTrigger) {
    setTrackedTrigger(trigger);
    if (trigger !== 0) setVisible(true);
  }

  useEffect(() => {
    if (trigger === 0) return;
    const timeout = setTimeout(() => setVisible(false), 1600);
    return () => clearTimeout(timeout);
  }, [trigger]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          variants={badgePop}
          initial="hidden"
          animate="visible"
          exit={{ opacity: 0, y: -8, scale: 0.9, transition: { duration: 0.2 } }}
          className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary-lighter px-3 py-1.5 text-xs font-bold text-primary"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          +{amount} XP
        </motion.div>
      )}
    </AnimatePresence>
  );
}
