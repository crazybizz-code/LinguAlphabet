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
      <Tuto pose={pose} size={tutoSize} animation={animation} className="mx-auto mb-6" alt="" />

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="mb-2 font-heading text-2xl font-extrabold leading-tight text-text-primary sm:text-3xl"
      >
        {title}
      </motion.h1>

      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="mx-auto mb-7 max-w-md text-sm leading-relaxed text-text-secondary sm:text-base"
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
 * hover/press physics, focus ring, disabled handling and arrow.
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
          ? "h-14 rounded-full px-10 text-base disabled:opacity-40"
          : "h-12 rounded-full px-8 text-base disabled:opacity-40"
      }
    >
      {children}
    </Button>
  );
}
