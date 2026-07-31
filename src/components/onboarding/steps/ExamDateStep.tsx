"use client";

import { TIMELINE_OPTIONS } from "@/lib/onboarding/constants";
import type { ExamTimeline } from "@/lib/onboarding/types";
import { OnboardingChoice } from "../OnboardingChoice";
import { OnboardingStepShell } from "../OnboardingStepShell";

/** Step 5. A vertical list rather than a grid — the labels are sentences, not tokens. */
export function ExamDateStep({
  selected,
  onSelect,
  onNext,
}: {
  selected: ExamTimeline | "";
  onSelect: (timeline: ExamTimeline) => void;
  onNext: () => void;
}) {
  return (
    <OnboardingStepShell
      pose="holding-clock"
      animation="floatSm"
      title="When is your IELTS exam?"
      subtitle="We'll personalize your study plan based on your timeline."
      onContinue={onNext}
      continueDisabled={!selected}
    >
      <div className="mx-auto max-w-sm space-y-3" role="radiogroup" aria-label="Exam timeline">
        {TIMELINE_OPTIONS.map((option) => {
          const isSelected = selected === option.id;
          return (
            <OnboardingChoice
              key={option.id}
              selected={isSelected}
              onClick={() => onSelect(option.id)}
              className="w-full items-center gap-4 px-5 py-4"
              showCheck={false}
            >
              <span
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md transition-colors duration-300 ${
                  isSelected ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-tertiary"
                }`}
              >
                <option.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-left">
                <span className="block text-sm font-medium text-text-primary">{option.id}</span>
                <span className="block text-xs text-text-secondary">{option.desc}</span>
              </span>
            </OnboardingChoice>
          );
        })}
      </div>
    </OnboardingStepShell>
  );
}
