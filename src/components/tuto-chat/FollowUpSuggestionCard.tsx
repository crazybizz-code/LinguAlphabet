"use client";

import { motion } from "framer-motion";
import { MessageCirclePlus } from "lucide-react";
import { fadeScaleIn } from "@/lib/motion/variants";

/** Sprint UX-2: one suggested next question, distinct from the lighter quick-reply chips — tapping sends it exactly like a chip would. */
export function FollowUpSuggestionCard({ question, onSelect }: { question: string; onSelect: (text: string) => void }) {
  return (
    <motion.button
      type="button"
      variants={fadeScaleIn}
      initial="hidden"
      animate="visible"
      onClick={() => onSelect(question)}
      className="flex items-start gap-2.5 rounded-2xl border border-border bg-bg-card p-3.5 text-left transition-all hover:border-primary/40 hover:bg-primary-lighter active:scale-[0.98]"
    >
      <MessageCirclePlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="text-sm font-medium text-text-secondary">
        <span className="font-bold text-text-primary">You might also ask:</span> {question}
      </span>
    </motion.button>
  );
}
