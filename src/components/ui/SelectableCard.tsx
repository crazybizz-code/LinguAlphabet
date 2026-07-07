"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SelectableCardProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Shared selected/unselected state styling for the level/goal/daily-time/
 * interests grids — each screen composes its own internal layout (badge +
 * text, icon-over-label, etc.) as children since those genuinely differ.
 */
export function SelectableCard({ selected, onClick, children, className }: SelectableCardProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        "rounded-lg border-2 text-left transition-all duration-300",
        selected
          ? "border-primary bg-primary-light shadow-glow"
          : "border-border bg-bg-card hover:border-[#CBD5E1] hover:bg-bg-muted",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
