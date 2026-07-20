"use client";

import { BookOpen, Mic, Briefcase, Plane, Building2, GraduationCap, FileCheck } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { OnboardingNav } from "@/components/layout/OnboardingNav";
import { useOnboardingData, writeOnboardingData } from "@/lib/onboarding/storage";

const GOALS = [
  { id: "General English", icon: BookOpen, color: "bg-blue-50 text-blue-500" },
  { id: "Speaking", icon: Mic, color: "bg-teal-50 text-teal-500" },
  { id: "Business English", icon: Briefcase, color: "bg-[#F1F5F9] text-slate-600" },
  { id: "Travel", icon: Plane, color: "bg-sky-50 text-sky-500" },
  { id: "Work", icon: Building2, color: "bg-purple-50 text-purple-500" },
  { id: "School", icon: GraduationCap, color: "bg-amber-50 text-amber-500" },
  { id: "Exam Preparation", icon: FileCheck, color: "bg-primary-lighter text-primary" },
] as const;

export default function GoalPage() {
  const goal = useOnboardingData().goal;

  return (
    <OnboardingLayout step={4} totalSteps={7} variant="checklist">
      <Tuto pose="pointing" size="md" animation="float" priority className="mx-auto mb-6" />
      <h1 className="mb-2 font-heading text-h1 font-bold text-text-primary">Your learning goal</h1>
      <p className="mb-8 text-body text-text-secondary">This shapes the content I&apos;ll prepare for you</p>

      <div className="mx-auto grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-3">
        {GOALS.map((option) => {
          const Icon = option.icon;
          const selected = goal === option.id;
          return (
            <SelectableCard
              key={option.id}
              selected={selected}
              onClick={() => writeOnboardingData({ goal: option.id })}
              className="flex flex-col items-center gap-2.5 px-4 py-5"
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-md ${option.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-small font-medium leading-tight text-text-secondary">{option.id}</span>
            </SelectableCard>
          );
        })}
      </div>

      <OnboardingNav backHref="/level" continueHref="/daily-time" continueDisabled={!goal} />
    </OnboardingLayout>
  );
}
