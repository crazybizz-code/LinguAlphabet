"use client";

import { Check } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { OnboardingNav } from "@/components/layout/OnboardingNav";
import { useOnboardingData, writeOnboardingData } from "@/lib/onboarding/storage";

const LEVELS = [
  { id: "A1", title: "Beginner", desc: "I know a few words and simple phrases" },
  { id: "A2", title: "Elementary", desc: "I can handle basic, everyday conversations" },
  { id: "B1", title: "Intermediate", desc: "I can discuss familiar topics with confidence" },
  { id: "B2", title: "Upper Intermediate", desc: "I can speak with reasonable fluency" },
  { id: "C1", title: "Advanced", desc: "I can express complex ideas fluently" },
  { id: "C2", title: "Mastery", desc: "I can use English effortlessly and precisely" },
] as const;

export default function LevelPage() {
  const level = useOnboardingData().level;

  return (
    <OnboardingLayout step={3} totalSteps={7} variant="checklist">
      <Tuto pose="thinking" size="md" animation="breathe" priority className="mx-auto mb-6" />
      <h1 className="mb-2 font-heading text-h1 font-bold text-text-primary">Your English level</h1>
      <p className="mb-8 text-body text-text-secondary">There&apos;s no wrong answer — I&apos;ll adapt to you</p>

      <div className="mx-auto grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
        {LEVELS.map((option) => {
          const selected = level === option.id;
          return (
            <SelectableCard
              key={option.id}
              selected={selected}
              onClick={() => writeOnboardingData({ level: option.id })}
              className="flex items-center gap-4 px-5 py-4"
            >
              <div
                className={
                  selected
                    ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary font-heading text-small font-bold text-text-on-primary"
                    : "flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#F1F5F9] font-heading text-small font-bold text-text-secondary"
                }
              >
                {option.id}
              </div>
              <div className="min-w-0">
                <p className="text-small font-medium text-text-primary">{option.title}</p>
                <p className="text-caption leading-snug text-text-secondary">{option.desc}</p>
              </div>
              {selected && <Check className="ml-auto h-5 w-5 shrink-0 text-primary" />}
            </SelectableCard>
          );
        })}
      </div>

      <OnboardingNav backHref="/name" continueHref="/goal" continueDisabled={!level} step="level" stepIndex={3} />
    </OnboardingLayout>
  );
}
