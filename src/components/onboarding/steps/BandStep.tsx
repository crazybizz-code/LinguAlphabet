"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import type { TutoPose } from "@/components/mascot/Tuto";
import { formatBand } from "@/lib/onboarding/constants";
import type { BandScore } from "@/lib/onboarding/types";
import { OnboardingChoice } from "../OnboardingChoice";
import { OnboardingStepShell } from "../OnboardingStepShell";

/**
 * Steps 3 and 4. One component serves both band screens because they are
 * the same control with a different option set — current band adds a
 * "Not sure" escape hatch, target band can raise a validation warning.
 * Splitting them would duplicate the grid, the selection logic and the
 * layout for no behavioural gain.
 */
export function BandStep({
  pose,
  title,
  subtitle,
  options,
  value,
  onSelect,
  unsure,
  onUnsure,
  onNext,
  canProceed,
  warning,
}: {
  pose: TutoPose;
  title: string;
  subtitle: string;
  options: readonly BandScore[];
  value: BandScore | null;
  onSelect: (band: BandScore) => void;
  /** Present only on the current-band screen. */
  unsure?: boolean;
  onUnsure?: () => void;
  onNext: () => void;
  canProceed: boolean;
  warning?: string | null;
}) {
  return (
    <OnboardingStepShell
      pose={pose}
      animation="breathe"
      title={title}
      subtitle={subtitle}
      onContinue={onNext}
      continueDisabled={!canProceed}
    >
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2.5" role="radiogroup" aria-label={title}>
        {onUnsure && (
          <OnboardingChoice selected={Boolean(unsure)} onClick={onUnsure} className="h-16" ariaLabel="Not sure">
            <span className="text-sm font-semibold text-text-primary">Not sure</span>
          </OnboardingChoice>
        )}
        {options.map((band) => (
          <OnboardingChoice
            key={band}
            selected={!unsure && value === band}
            onClick={() => onSelect(band)}
            className="h-16"
            ariaLabel={`Band ${formatBand(band)}`}
          >
            <span className="font-heading text-lg font-bold text-text-primary">{formatBand(band)}</span>
          </OnboardingChoice>
        ))}
      </div>

      {/* Inline and non-blocking: the learner can see what is wrong and
          fix it in place, rather than facing a dead Continue button with
          no explanation. */}
      {warning && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 flex items-center justify-center gap-2 text-sm text-warning"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {warning}
        </motion.p>
      )}
    </OnboardingStepShell>
  );
}
