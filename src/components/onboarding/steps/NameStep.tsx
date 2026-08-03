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
      {/* Width is constrained at the WRAPPER level so the Input component
          fills the full container and renders exactly one clean border.
          Previously max-w-xs was passed via `className` which forwarded it
          to the inner <input> element — the wrapper div (always full-width)
          and the constrained inner element both showed their background and
          rounded corners, creating the double-border appearance. */}
      <div className="mx-auto max-w-xs">
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
          className="text-center text-lg"
        />
      </div>

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
