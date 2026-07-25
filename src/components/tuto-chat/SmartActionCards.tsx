"use client";

import { motion } from "framer-motion";
import { Lightbulb, Wand2, HelpCircle, type LucideIcon } from "lucide-react";
import { EASE } from "@/lib/motion/variants";

export interface SmartActionCardsProps {
  onExample: () => void;
  onSimplify: () => void;
  onQuiz: () => void;
}

interface SmartAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

/**
 * Sprint UX-2: teacher-initiated next actions, not ChatGPT's
 * regenerate/copy/thumbs-up-down pattern — Tuto offering to teach
 * further, not an assistant awaiting a rating. `Wand2` for "simplify"
 * matches SelectionToolbar's existing icon for the same action
 * elsewhere in the app.
 */
export function SmartActionCards({ onExample, onSimplify, onQuiz }: SmartActionCardsProps) {
  const actions: SmartAction[] = [
    { key: "example", label: "Give an example", icon: Lightbulb, onClick: onExample },
    { key: "simplify", label: "Explain more simply", icon: Wand2, onClick: onSimplify },
    { key: "quiz", label: "Quiz me", icon: HelpCircle, onClick: onQuiz },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action, index) => (
        <motion.button
          key={action.key}
          type="button"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE.out, delay: 0.1 + index * 0.05 }}
          onClick={action.onClick}
          className="flex items-center gap-1.5 rounded-2xl border border-border bg-bg-card px-3 py-2 text-xs font-bold text-text-primary transition-all hover:border-primary/40 hover:bg-primary-lighter active:scale-[0.97]"
        >
          <action.icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {action.label}
        </motion.button>
      ))}
    </div>
  );
}
