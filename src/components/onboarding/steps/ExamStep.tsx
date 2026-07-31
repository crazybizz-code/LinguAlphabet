"use client";

import { EXAM_OPTIONS } from "@/lib/onboarding/constants";
import { SELECTABLE_EXAM, type ExamType } from "@/lib/onboarding/types";
import { ComingSoonChoice, OnboardingChoice } from "../OnboardingChoice";
import { OnboardingStepShell } from "../OnboardingStepShell";

/** Step 2. Only IELTS Academic is selectable; the rest are honest "Coming Soon" tiles. */
export function ExamStep({
  selected,
  onSelect,
  onNext,
}: {
  selected: ExamType;
  onSelect: (exam: ExamType) => void;
  onNext: () => void;
}) {
  return (
    <OnboardingStepShell
      pose="pointing"
      title="Which exam are you preparing for?"
      subtitle="Choose your target exam."
      onContinue={onNext}
      continueDisabled={selected !== SELECTABLE_EXAM}
    >
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3" role="radiogroup" aria-label="Target exam">
        {EXAM_OPTIONS.map((exam) =>
          exam.available ? (
            <OnboardingChoice
              key={exam.id}
              selected={selected === exam.id}
              onClick={() => onSelect(exam.id)}
              className="flex-col gap-2.5 px-4 py-5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-lighter">
                <exam.icon className="h-5 w-5 text-primary" />
              </span>
              <span className="text-sm font-semibold leading-tight text-text-primary">{exam.id}</span>
            </OnboardingChoice>
          ) : (
            <ComingSoonChoice key={exam.id} icon={exam.icon} title={exam.id} />
          ),
        )}
      </div>
    </OnboardingStepShell>
  );
}
