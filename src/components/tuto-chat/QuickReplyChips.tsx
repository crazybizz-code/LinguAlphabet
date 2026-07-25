"use client";

import { motion } from "framer-motion";
import { EASE } from "@/lib/motion/variants";

/** Sprint UX-2: short, first-person replies the learner might want to send next — lighter-weight than SmartActionCards, plain text pills. */
export function QuickReplyChips({ replies, onSelect }: { replies: string[]; onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {replies.map((reply, index) => (
        <motion.button
          key={reply}
          type="button"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE.out, delay: index * 0.05 }}
          onClick={() => onSelect(reply)}
          className="rounded-full border border-border bg-bg-card px-3.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary active:scale-[0.97]"
        >
          {reply}
        </motion.button>
      ))}
    </div>
  );
}
