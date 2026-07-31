"use client";

import { motion } from "framer-motion";
import { Input } from "@/components/ui/Input";
import { OnboardingStepShell } from "../OnboardingStepShell";

/**
 * Step 1. Enter submits, so a learner who types and hits return is not
 * forced to reach for the button — the single most common interaction on
 * a one-field screen.
 */
export function NameStep({
  value,
  onChange,
  onNext,
}: {
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
}) {
  const filled = value.trim().length > 0;

  return (
    <OnboardingStepShell
      pose="listening"
      animation="floatSm"
      title="What's your name?"
      subtitle="Tuto will personalize your IELTS journey."
      onContinue={onNext}
      continueDisabled={!filled}
    >
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && filled) onNext();
        }}
        placeholder="Enter your name"
        aria-label="Your name"
        autoFocus
        autoComplete="given-name"
        className="mx-auto h-14 max-w-xs rounded-choice bg-bg-muted text-center text-lg"
      />

      {/* Immediate, warm acknowledgement the moment a name exists — the
          first point in the flow where Tuto responds to the learner
          rather than only asking of them. */}
      {filled && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-sm font-medium text-primary"
          aria-live="polite"
        >
          Nice to meet you, {value.trim()}!
        </motion.p>
      )}
    </OnboardingStepShell>
  );
}
