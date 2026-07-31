"use client";

import { DAILY_TIME_ICON, DAILY_TIME_OPTIONS } from "@/lib/onboarding/constants";
import type { DailyStudyTime } from "@/lib/onboarding/types";
import { OnboardingChoice } from "../OnboardingChoice";
import { OnboardingStepShell } from "../OnboardingStepShell";

/** Step 6. The icon fills on selection, which is why these tiles carry no check badge. */
export function DailyTimeStep({
  selected,
  onSelect,
  onNext,
}: {
  selected: DailyStudyTime | null;
  onSelect: (minutes: DailyStudyTime) => void;
  onNext: () => void;
}) {
  return (
    <OnboardingStepShell
      pose="neutral"
      title="How much time can you study each day?"
      subtitle="Choose a realistic daily commitment."
      onContinue={onNext}
      continueDisabled={selected === null}
    >
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3" role="radiogroup" aria-label="Daily study time">
        {DAILY_TIME_OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <OnboardingChoice
              key={option.value}
              selected={isSelected}
              onClick={() => onSelect(option.value)}
              className="flex-col gap-2 px-4 py-5"
              showCheck={false}
              ariaLabel={`${option.label} — ${option.desc}`}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-300 ${
                  isSelected ? "bg-primary text-text-on-primary" : "bg-bg-muted text-text-tertiary"
                }`}
              >
                <DAILY_TIME_ICON className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-heading text-lg font-bold text-text-primary">{option.label}</span>
              <span className="text-xs text-text-secondary">{option.desc}</span>
            </OnboardingChoice>
          );
        })}
      </div>
    </OnboardingStepShell>
  );
}
