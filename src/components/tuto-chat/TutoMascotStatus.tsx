"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Tuto, type TutoPose } from "@/components/mascot/Tuto";
import { AdaptiveLevelBadge } from "./AdaptiveLevelBadge";
import { EASE } from "@/lib/motion/variants";
import type { MascotState } from "@/hooks/useTutoMascotState";
import type { CefrLevel } from "@/ai/context";

const STATE_COPY: Record<MascotState, { pose: TutoPose; caption: string; animation: "breathe" | "floatSm" | "none" }> = {
  idle: { pose: "neutral", caption: "Ready when you are", animation: "floatSm" },
  thinking: { pose: "thinking", caption: "Thinking…", animation: "breathe" },
  teaching: { pose: "pointing", caption: "Explaining…", animation: "floatSm" },
  waiting: { pose: "listening", caption: "Your turn", animation: "floatSm" },
  success: { pose: "celebrating", caption: "Got it!", animation: "floatSm" },
  error: { pose: "neutral", caption: "Something went wrong", animation: "none" },
};

/**
 * Sprint UX-1 (Living Tuto): a persistent, sticky-top ambient presence
 * inside the chat sheet — mirrors the sticky-bottom input treatment
 * already used in TutoChatPanel, so pinning this needs no change to
 * EditSheet (its `title` prop is a plain string, not a header slot).
 */
export function TutoMascotStatus({ state, level }: { state: MascotState; level?: CefrLevel | null }) {
  const { pose, caption, animation } = STATE_COPY[state];

  return (
    <div className="sticky top-0 z-10 -mx-6 mb-1 flex items-center gap-3 border-b border-border bg-bg-card/95 px-6 py-3 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        <motion.div
          key={pose}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3, ease: EASE.standard }}
        >
          <Tuto pose={pose} size="xs" animation={animation} />
        </motion.div>
      </AnimatePresence>
      <p className="flex-1 text-sm font-semibold text-text-secondary">{caption}</p>
      <AdaptiveLevelBadge level={level} />
    </div>
  );
}
