"use client";

import { motion } from "framer-motion";
import { EASE } from "@/lib/motion/variants";

const DOT_DELAYS = [0, 0.15, 0.3];

/**
 * Sprint UX-1: a calmer, Apple-like replacement for a plain border-spin
 * spinner — three dots breathing in a soft, staggered sequence rather
 * than a mechanical rotation.
 */
export function TypingIndicator({ label = "Tuto is thinking" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1" role="status" aria-label={label}>
      {DOT_DELAYS.map((delay) => (
        <motion.span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-text-tertiary"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: EASE.standard, delay }}
        />
      ))}
    </span>
  );
}
