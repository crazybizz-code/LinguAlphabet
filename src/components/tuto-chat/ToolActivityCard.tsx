"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/motion/variants";

export interface ToolActivityCardProps {
  icon: LucideIcon;
  label: string;
  /** Tailwind background/text pair, e.g. "bg-cat-2/10 text-cat-2". */
  colorClassName: string;
}

/** A single step in ThinkingTimeline — small, quiet, never loud. */
export function ToolActivityCard({ icon: Icon, label, colorClassName }: ToolActivityCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ duration: 0.25, ease: EASE.out }}
      className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold", colorClassName)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </motion.div>
  );
}
