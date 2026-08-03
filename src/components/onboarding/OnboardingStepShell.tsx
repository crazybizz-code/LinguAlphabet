"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Tuto, type TutoPose, type TutoSize } from "@/components/mascot/Tuto";
import type { TutoAnimation } from "@/lib/motion/variants";
import { Button } from "@/components/ui/Button";

/**
 * The repeated frame every question screen sits in: Tuto, a heading, an
 * optional subtitle, the screen's own controls, and the Continue CTA.
 *
 * Exists so the seven screens differ only where they genuinely differ.
 * The heading/subtitle entrance timings are staggered (0.1s / 0.15s)
 * exactly as in the handoff, which is what makes each step feel like it
 * is being introduced rather than simply appearing.
 */
export interface OnboardingStepShellProps {
  pose: TutoPose;
  tutoSize?: TutoSize;
  animation?: TutoAnimation;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Omitted on the final screen, which has its own distinct CTA. */
  onContinue?: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
}

export function OnboardingStepShell({
  pose,
  tutoSize = "md",
  animation = "float",
  title,
  subtitle,
  children,
  onContinue,
  continueDisabled = false,
  continueLabel = "Continue",
}: OnboardingStepShellProps) {
  return (
    <div className="text-center">
      {/* mb-4 (16px) vs previous mb-6 (24px) — tighter connection between
          Tuto and the question below it makes Tuto feel like a guide asking
          something rather than a decoration above a form. */}
      <Tuto pose={pose} size={tutoSize} animation={animation} className="mx-auto mb-4" alt="" />

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="mb-3 font-heading text-[26px] font-extrabold leading-tight tracking-tight text-text-primary sm:text-[30px]"
      >
        {title}
      </motion.h1>

      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="mx-auto mb-7 max-w-[340px] text-sm leading-relaxed text-text-secondary sm:text-base"
        >
          {subtitle}
        </motion.p>
      )}

      {children}

      {onContinue && (
        <div className="mt-8">
          <OnboardingContinue onClick={onContinue} disabled={continueDisabled}>
            {continueLabel}
          </OnboardingContinue>
        </div>
      )}
    </div>
  );
}

/**
 * The onboarding CTA: the shared Button, reshaped to the handoff's pill
 * geometry (48px tall, fully rounded) rather than reimplemented. The
 * project's Button is 56px and 24px-radius by default; tailwind-merge
 * lets the caller override those two properties while keeping its
 * hover/press physics, focus ring, and arrow.
 *
 * `disabled:opacity-40` is intentionally absent here. The Button's built-in
 * `disabled:bg-primary/40` already communicates the disabled state with a
 * muted translucent orange — stacking another `opacity-40` on top of that
 * compounded to ~16% effective opacity, making the CTA nearly invisible and
 * failing the design brief's "not almost invisible" requirement.
 */
export function OnboardingContinue({
  onClick,
  disabled,
  loading,
  children,
  size = "md",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      arrow={!loading}
      className={
        size === "lg"
          ? "h-14 rounded-full px-10 text-base"
          : "h-12 rounded-full px-8 text-base"
      }
    >
      {children}
    </Button>
  );
}
