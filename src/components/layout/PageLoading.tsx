"use client";

import { motion } from "framer-motion";
import { Tuto, type TutoPose } from "@/components/mascot/Tuto";

export interface PageLoadingProps {
  pose: TutoPose;
  message: string;
  /** Full-bleed routes (Podcast/Article Learning Session, outside DashboardShell) need the full viewport; shell-wrapped routes only need to fill the shell's own content area. */
  fullBleed?: boolean;
}

/**
 * Shared shape for every route's loading.tsx — animated, contextual Tuto
 * pose + a short, specific status line (never a generic spinner, per
 * dashboard/loading.tsx's original product decision). The fade+rise
 * entrance is what was missing before: without it, this state just pops
 * onto a blank screen the instant navigation starts, which is exactly
 * what read as "empty" — a beat of motion here is the cheapest, highest-
 * leverage fix for that.
 */
export function PageLoading({ pose, message, fullBleed = false }: PageLoadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
      className={`flex flex-col items-center justify-center gap-4 px-6 text-center ${fullBleed ? "min-h-dvh bg-bg" : "min-h-[70vh]"}`}
    >
      <Tuto pose={pose} size="sm" animation="floatSm" />
      <p className="text-sm font-medium text-text-tertiary">{message}</p>
    </motion.div>
  );
}
