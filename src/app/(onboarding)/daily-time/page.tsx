"use client";

import { Clock, Check } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { OnboardingNav } from "@/components/layout/OnboardingNav";
import { useOnboardingData, writeOnboardingData } from "@/lib/onboarding/storage";

const DAILY_TIMES = [
  { value: 10, label: "10 min", desc: "Casual" },
  { value: 20, label: "20 min", desc: "Regular" },
  { value: 30, label: "30 min", desc: "Committed" },
  { value: 45, label: "45 min", desc: "Serious" },
  { value: 60, label: "60 min", desc: "Intensive" },
] as const;

export default function DailyTimePage() {
  const dailyTime = useOnboardingData().dailyTime;

  return (
    <OnboardingLayout step={5} totalSteps={7} variant="checklist">
      <Tuto pose="holding-clock" size="md" animation="floatSm" priority className="mx-auto mb-6" />
      <h1 className="mb-2 font-heading text-h1 font-bold text-text-primary">Daily learning time</h1>
      <p className="mb-8 text-body text-text-secondary">Even 10 minutes a day makes a difference</p>

      <div className="mx-auto max-w-sm space-y-3">
        {DAILY_TIMES.map((option) => {
          const selected = dailyTime === option.value;
          return (
            <SelectableCard
              key={option.value}
              selected={selected}
              onClick={() => writeOnboardingData({ dailyTime: option.value })}
              className="flex w-full items-center gap-4 px-5 py-4"
            >
              <div
                className={
                  selected
                    ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-text-on-primary"
                    : "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F1F5F9] text-text-tertiary"
                }
              >
                <Clock className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="font-medium text-text-primary">{option.label}</p>
                <p className="text-caption text-text-secondary">{option.desc}</p>
              </div>
              {selected && <Check className="ml-auto h-5 w-5 text-primary" />}
            </SelectableCard>
          );
        })}
      </div>

      <OnboardingNav backHref="/goal" continueHref="/interests" continueDisabled={dailyTime === null} step="daily_time" stepIndex={5} />
    </OnboardingLayout>
  );
}
