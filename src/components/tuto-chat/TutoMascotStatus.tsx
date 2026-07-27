"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Tuto, type TutoPose } from "@/components/mascot/Tuto";
import { AdaptiveLevelBadge } from "./AdaptiveLevelBadge";
import { EASE } from "@/lib/motion/variants";
import type { MascotState } from "@/hooks/useTutoMascotState";
import type { ChatOrchestratorAction } from "@/lib/tuto-chat/streamChatCompletion";
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
 * Refines the generic "success" flash with what the Learning Orchestrator
 * (src/ai/learning-orchestrator) actually decided this turn — the
 * difference between "a reply just finished" and "Tuto just celebrated
 * real mastery" / "gave a hint" / "simplified" was previously invisible
 * to the learner (docs/mvp-completion-audit.md P0.4). Only overrides the
 * transient "success" moment; every other MascotState is unaffected.
 * Actions with no distinct coaching moment worth calling out (continue,
 * skip, finish) fall through to the default "Got it!" — same as before
 * this existed.
 */
const SUCCESS_ACTION_COPY: Partial<Record<ChatOrchestratorAction, { pose: TutoPose; caption: string }>> = {
  celebrate: { pose: "celebrating", caption: "Celebrating your progress!" },
  "give-hint": { pose: "pointing", caption: "Here's a hint" },
  repeat: { pose: "thinking", caption: "Let's go over that again" },
  simplify: { pose: "thinking", caption: "Let's make this simpler" },
  escalate: { pose: "pointing", caption: "Let me explain it differently" },
};

/**
 * Sprint UX-1 (Living Tuto): a persistent, sticky-top ambient presence
 * inside the chat sheet — mirrors the sticky-bottom input treatment
 * already used in TutoChatPanel, so pinning this needs no change to
 * EditSheet (its `title` prop is a plain string, not a header slot).
 */
export function TutoMascotStatus({
  state,
  level,
  orchestratorAction,
}: {
  state: MascotState;
  level?: CefrLevel | null;
  /** Optional: omitted call sites keep the original generic "success" copy. */
  orchestratorAction?: ChatOrchestratorAction | null;
}) {
  const base = STATE_COPY[state];
  const override = state === "success" && orchestratorAction ? SUCCESS_ACTION_COPY[orchestratorAction] : undefined;
  const pose = override?.pose ?? base.pose;
  const caption = override?.caption ?? base.caption;
  const { animation } = base;

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
