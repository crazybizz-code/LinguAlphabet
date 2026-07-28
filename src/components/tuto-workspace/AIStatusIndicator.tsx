"use client";

import { motion, AnimatePresence } from "framer-motion";
import { TypingIndicator } from "@/components/tuto-chat/TypingIndicator";
import { EASE } from "@/lib/motion/variants";
import type { ThinkingPhase } from "@/hooks/useThinkingPhase";

const PHASE_LABEL: Record<ThinkingPhase, string> = {
  reading: "Reading your message",
  thinking: "Thinking",
};

/**
 * Tuto Workspace's live-turn status row — the same breathing dots
 * TypingIndicator already provides everywhere else, given a visible,
 * crossfading label so the wait reads as two honest phases (reading,
 * then thinking) instead of one undifferentiated spinner. The brief's
 * third phase, "Writing", takes over the instant real content arrives —
 * that's shown on the message bubble itself (ChatBubble's sender row),
 * not here, since by then this row has nothing left to represent.
 */
export function AIStatusIndicator({ phase }: { phase: ThinkingPhase }) {
  return (
    <div className="flex items-center gap-2 py-1 pl-1" role="status" aria-live="polite">
      <TypingIndicator label={PHASE_LABEL[phase]} />
      <AnimatePresence mode="wait">
        <motion.span
          key={phase}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.18, ease: EASE.standard }}
          className="text-xs font-medium text-text-tertiary"
        >
          {PHASE_LABEL[phase]}…
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
