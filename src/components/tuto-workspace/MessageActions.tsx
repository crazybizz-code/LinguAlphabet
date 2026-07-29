"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, RotateCcw, ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeSlideUp } from "@/lib/motion/variants";

const COPIED_RESET_MS = 1500;

const BUTTON_CLASS =
  "flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-muted hover:text-text-secondary active:scale-[0.92]";

export interface MessageActionsProps {
  /** The reply's plain text — copied as-is (no markdown syntax stripped, matching what a learner would want to paste elsewhere verbatim). */
  content: string;
  onRegenerate: () => void;
}

/**
 * The meta-action row under a settled Tuto reply — copy/regenerate/rate.
 * Deliberately local-only: thumbs up/down flip a per-message UI state for
 * the "premium, responsive" feel this sprint is about, but persisting
 * feedback anywhere would be a new product feature (a rating pipeline),
 * not polish, so there's no backend call here at all.
 */
export function MessageActions({ content, onRegenerate }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — a
      // silent no-op is the right fallback for a low-stakes convenience
      // action, not an error state that interrupts the conversation.
    }
  }

  return (
    <motion.div variants={fadeSlideUp} initial="hidden" animate="visible" className="flex items-center gap-0.5">
      <button type="button" onClick={handleCopy} aria-label={copied ? "Copied" : "Copy message"} className={BUTTON_CLASS}>
        {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
      <button type="button" onClick={onRegenerate} aria-label="Regenerate response" className={BUTTON_CLASS}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setFeedback((prev) => (prev === "up" ? null : "up"))}
        aria-label="Good response"
        aria-pressed={feedback === "up"}
        className={cn(BUTTON_CLASS, feedback === "up" && "text-primary hover:text-primary")}
      >
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" fill={feedback === "up" ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        onClick={() => setFeedback((prev) => (prev === "down" ? null : "down"))}
        aria-label="Poor response"
        aria-pressed={feedback === "down"}
        className={cn(BUTTON_CLASS, feedback === "down" && "text-danger hover:text-danger")}
      >
        <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" fill={feedback === "down" ? "currentColor" : "none"} />
      </button>
    </motion.div>
  );
}
