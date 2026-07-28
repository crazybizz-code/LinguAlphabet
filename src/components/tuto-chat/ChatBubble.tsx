"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { renderTutoMarkdown } from "@/lib/tuto-chat/markdown";
import { useProgressiveReveal, prefersReducedMotion } from "@/hooks/useProgressiveReveal";
import { useChunkedReveal, estimateChunkedRevealDurationMs } from "@/hooks/useChunkedReveal";
import { Tuto } from "@/components/mascot/Tuto";
import { fadeSlideUp, EASE } from "@/lib/motion/variants";
import type { ChatMessage } from "@/lib/tuto-chat/types";

/** How much longer the cursor blinks at the tail after the reveal animation itself finishes — a short, deliberate "Tuto just finished writing" beat, not part of the typing motion. */
const CURSOR_GRACE_MS = 300;

/** A blinking text-cursor, shown only while this exact bubble is the one actively revealing — never on a completed message, never on a user bubble. */
function BlinkingCursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-pulse bg-text-tertiary align-middle"
    />
  );
}

export interface ChatBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
  /** Tuto Workspace only (Base44 reference) — a small avatar + "Tuto" label above the bubble. Defaults to off so the legacy sheet (TutoChatPanel) renders exactly as it always has. */
  showSender?: boolean;
  /** Tuto Workspace only — fades/slides the whole bubble in on mount, the moment real content first replaces the Reading/Thinking status row. Defaults to off so the legacy sheet's bubbles keep popping in instantly, unchanged. */
  animateEntrance?: boolean;
  /**
   * "reactive" (default, the legacy sheet's original and only-ever
   * behavior): `isRevealing` tracks `streaming` live every render, so it
   * can snap early to full text if the backend's turn status happens to
   * settle before the local reveal animation finishes.
   * "committed" (Tuto Workspace only): decides once, at mount, whether
   * this bubble should reveal, then runs its own fixed local timer to
   * completion regardless of what `streaming` does afterward — the AI
   * Service always yields one already-complete answer, then a "done"
   * event right behind it (docs/ai-architecture.md's "Streaming + tools"
   * note), and those two can land close enough together that the turn's
   * status flips to idle before this component's very first real-content
   * render, cutting a merely-reactive reveal short.
   */
  revealMode?: "reactive" | "committed";
}

export function ChatBubble({
  message,
  streaming,
  showSender = false,
  animateEntrance = false,
  revealMode = "reactive",
}: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isCommitted = revealMode === "committed";

  const [shouldReveal] = useState(() => Boolean(streaming) && !isUser && message.content.length > 0);
  const [committedRevealActive, setCommittedRevealActive] = useState(shouldReveal);

  /**
   * useProgressiveReveal seeds its very first `displayed`/tracked-target
   * value from whatever `target` it's handed on mount — correct for a
   * bubble that already existed in the DOM before real content replaced a
   * placeholder, but this component only ever mounts once content is
   * already the complete final string (the map above skips rendering it
   * at all while empty), so feeding the full text straight in would look
   * to the hook like nothing had changed, and it would skip animating
   * entirely. Withholding the real text for one extra render (via this
   * state, not a ref, since the hook needs an actual re-render to observe
   * the "" -> full-text transition) gives it a genuine starting point to
   * animate from, exactly once, only in committed mode.
   */
  const [committedRevealTarget, setCommittedRevealTarget] = useState(() => (shouldReveal ? "" : message.content));
  useEffect(() => {
    if (!isCommitted || !shouldReveal) return;
    // Deliberately deferred to a second render, not the render-phase
    // "adjust state from props" pattern used elsewhere in this codebase —
    // useProgressiveReveal needs to actually observe the "" -> full-text
    // transition across two renders to animate it; doing this synchronously
    // during the first render would give it nothing to diff against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCommittedRevealTarget(message.content);
  }, [isCommitted, shouldReveal, message.content]);

  useEffect(() => {
    if (!isCommitted || !shouldReveal) return;
    const duration = prefersReducedMotion() ? 0 : estimateChunkedRevealDurationMs(message.content) + CURSOR_GRACE_MS;
    const timeout = setTimeout(() => setCommittedRevealActive(false), duration);
    return () => clearTimeout(timeout);
    // message.content intentionally omitted: with this architecture a
    // message's content arrives once, complete, and never grows further —
    // there's nothing later to re-arm this timer for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCommitted, shouldReveal]);

  const isRevealing = isCommitted ? committedRevealActive && !isUser : Boolean(streaming) && !isUser;
  // Both hooks are always called (React's rules of hooks forbid
  // conditionally calling one or the other) — only the branch matching
  // `revealMode` ever actually animates, since the other's `active` is
  // always false. Legacy (reactive) keeps useProgressiveReveal's
  // character-by-character animation completely unchanged; Tuto Workspace
  // (committed) uses the chunk-by-chunk one instead (see useChunkedReveal's
  // own doc comment for why).
  const reactiveRevealed = useProgressiveReveal(message.content, !isCommitted && isRevealing);
  const chunkedRevealed = useChunkedReveal(committedRevealTarget, isCommitted && isRevealing);
  const revealed = isCommitted ? chunkedRevealed : reactiveRevealed;
  // Only once revealed has actually caught up to the full target — a
  // streamed reply's content can still be growing while an earlier reveal
  // pass is mid-animation, and the cursor should track the true tail, not
  // blink prematurely at a mid-string position.
  const showCursor = isRevealing && revealed.length >= message.content.length;

  const inner = (
    <>
      {showSender && !isUser && (
        <div className="mb-1.5 flex items-center gap-1.5 pl-1">
          <Tuto pose="neutral" size="xs" animation="none" className="h-5 w-5" />
          <span className="text-xs font-semibold text-text-tertiary">Tuto</span>
          <AnimatePresence>
            {isRevealing && (
              <motion.span
                initial={{ opacity: 0, x: -3 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE.standard }}
                className="text-[11px] font-medium text-text-tertiary/70"
              >
                · writing
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-primary",
        )}
      >
        {isUser ? message.content : renderTutoMarkdown(revealed)}
        {showCursor && <BlinkingCursor />}
      </div>
    </>
  );

  if (!animateEntrance) {
    return <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>{inner}</div>;
  }

  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="visible"
      className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
    >
      {inner}
    </motion.div>
  );
}
