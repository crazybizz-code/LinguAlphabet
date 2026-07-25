"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Compass, ArrowRight } from "lucide-react";
import { fadeScaleIn } from "@/lib/motion/variants";

/**
 * Sprint UX-2: a gentle "keep going" nudge shown once a conversation has
 * gone on a while. Links to the real dashboard rather than inventing a
 * content picker — the Learning Brain (CLAUDE.md: not yet built) is what
 * will eventually decide what's next, so this never lets the learner
 * manually browse lessons here.
 */
export function LearningPathCard() {
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
        <p className="text-sm font-bold text-text-primary">Ready to keep building?</p>
        <p className="text-xs text-text-secondary">Head back to your dashboard for what&apos;s next.</p>
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
