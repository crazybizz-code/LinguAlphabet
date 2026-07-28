"use client";

import { Sparkles, ListChecks, Target, FileText, Bookmark, HelpCircle, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion/variants";

/**
 * Keyword → icon for Tuto Workspace's action/starter chips (Base44
 * reference shows an icon per chip) — purely presentational, layered on
 * top of whatever label the model or a starter list actually provides.
 * Never changes what's hardcoded vs. AI-generated (src/ai/services/
 * quick-actions.ts): this only decides which icon a given label's own
 * wording suggests. Falls back to Sparkles for anything that doesn't
 * match a known pattern, so a genuinely novel model-generated label never
 * renders with a missing icon.
 */
const ICON_RULES: Array<{ match: RegExp; icon: LucideIcon }> = [
  { match: /example/i, icon: ListChecks },
  { match: /practice|quiz/i, icon: Target },
  { match: /summar/i, icon: FileText },
  { match: /save/i, icon: Bookmark },
  { match: /\?\s*$/, icon: HelpCircle },
];

function iconFor(label: string): LucideIcon {
  return ICON_RULES.find((rule) => rule.match.test(label))?.icon ?? Sparkles;
}

export function ActionChips({ actions, onSelect }: { actions: string[]; onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action, index) => {
        const Icon = iconFor(action);
        return (
          <motion.button
            key={action}
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE.out, delay: index * 0.05 }}
            onClick={() => onSelect(action)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-bg-card px-3.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary active:scale-[0.97]"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {action}
          </motion.button>
        );
      })}
    </div>
  );
}
