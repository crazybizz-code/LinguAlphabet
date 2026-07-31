"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { ComponentType } from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The selectable tile used by every choice screen in the IELTS
 * onboarding: exam grid, band grids, exam-date list, daily-time grid.
 *
 * Deliberately separate from ui/SelectableCard rather than an extension
 * of it. That component is also used by ProfileView and the legacy
 * onboarding screens, and this one differs in geometry (16px radius vs
 * 24px), in selected fill, and in carrying a check badge — changing the
 * shared one to match would silently restyle Profile, which is outside
 * the scope of this work.
 *
 * Motion matches the handoff exactly: a 0.96 press, a subtle 1.02 lift
 * while selected, and the project's standard [0.22, 1, 0.36, 1] easing.
 * Colour transitions are separated from the scale spring so the border
 * fades rather than snapping.
 */
export interface OnboardingChoiceProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  /** The check badge is hidden where selection is already obvious from a filled icon. */
  showCheck?: boolean;
  /** Accessible label when the visible children are not self-describing. */
  ariaLabel?: string;
}

export function OnboardingChoice({
  selected,
  onClick,
  children,
  className,
  showCheck = true,
  ariaLabel,
}: OnboardingChoiceProps) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      whileTap={{ scale: 0.96 }}
      animate={{ scale: selected ? 1.02 : 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center rounded-choice border-2 text-left",
        "transition-colors duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
        selected
          ? "border-primary bg-primary-lighter shadow-glow"
          : "border-border bg-bg-card hover:border-[#CBD5E1] hover:bg-bg-muted",
        className,
      )}
    >
      {children}
      {selected && showCheck && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary"
          aria-hidden="true"
        >
          <Check className="h-3 w-3 text-text-on-primary" strokeWidth={3} />
        </motion.span>
      )}
    </motion.button>
  );
}

/**
 * The disabled counterpart shown for every exam that is not yet
 * supported. Rendered as a real <div>, not a disabled button: there is no
 * action to perform, and a focusable control that does nothing is worse
 * for keyboard and screen-reader users than a plainly-labelled tile.
 */
export function ComingSoonChoice({ icon: Icon, title }: { icon: ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="relative flex cursor-not-allowed flex-col items-center gap-2 rounded-choice border-2 border-border-light bg-bg-muted/50 px-4 py-5">
      <Lock className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E2E8F0]/70">
        <Icon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
      </div>
      <span className="text-sm font-medium text-text-tertiary">{title}</span>
      <span className="rounded-full bg-[#E2E8F0]/50 px-2.5 py-0.5 text-[10px] font-semibold text-text-tertiary">
        Coming Soon
      </span>
    </div>
  );
}
