"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Compass, ArrowRight } from "lucide-react";
import { fadeScaleIn } from "@/lib/motion/variants";
import type { CefrLevel } from "@/ai/context";

export interface LearningPathCardProps {
  /** The real signal already flowing through this conversation — lessonSummary.ts's extraction and the same CEFR level threaded via TutoContextInput. Both optional; the copy degrades gracefully to a generic nudge when neither is available, never inventing a fake recommendation. */
  topic?: string | null;
  level?: CefrLevel | null;
}

/**
 * Sprint UX-2's generic "keep going" nudge, made adaptive in Sprint UX-3
 * ("Continue learning recommendation") — still shown once a conversation
 * has gone on a while, still links to the real dashboard rather than
 * inventing a content picker (the Learning Brain, per CLAUDE.md, isn't
 * built yet), but the copy now reflects what was actually just covered
 * and at what level, instead of being purely generic.
 */
export function LearningPathCard({ topic = null, level = null }: LearningPathCardProps) {
  const title = topic ? `Ready to build on "${topic}"?` : "Ready to keep building?";
  const subtitle = level
    ? `Head back to your dashboard — we'll keep it at your ${level} level.`
    : "Head back to your dashboard for what's next.";

  return (
    <motion.div
      variants={fadeScaleIn}
      initial="hidden"
      animate="visible"
      className="flex items-center gap-3 rounded-2xl border border-primary-light bg-primary-lighter p-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-bg-card">
        <Compass className="h-5 w-5 text-primary" aria-hidden="true" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-bold text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary">{subtitle}</p>
      </div>
      <Link
        href="/dashboard"
        aria-label="Go to dashboard"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-text-on-primary transition-all hover:opacity-90 active:scale-[0.95]"
      >
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </motion.div>
  );
}
