"use client";

import { motion } from "framer-motion";
import { BookMarked } from "lucide-react";
import { fadeScaleIn } from "@/lib/motion/variants";

/** Sprint UX-3: `topic` comes from lessonSummary.ts's real extraction off Tuto's own reply text, never fabricated. */
export function LessonSummaryCard({ topic }: { topic: string }) {
  return (
    <motion.div
      variants={fadeScaleIn}
      initial="hidden"
      animate="visible"
      className="flex items-start gap-2.5 rounded-2xl border border-border bg-bg-card p-3.5"
    >
      <BookMarked className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-sm text-text-secondary">
        <span className="font-bold text-text-primary">Today&apos;s focus: </span>
        {topic}
      </p>
    </motion.div>
  );
}
