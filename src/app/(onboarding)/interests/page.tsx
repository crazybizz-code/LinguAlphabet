"use client";

import { motion } from "framer-motion";
import {
  Cpu,
  Briefcase,
  FlaskConical,
  Clapperboard,
  BookOpen,
  Gamepad2,
  Music,
  Plane,
  Trophy,
  UtensilsCrossed,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tuto } from "@/components/mascot/Tuto";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { OnboardingNav } from "@/components/layout/OnboardingNav";
import { useOnboardingData, writeOnboardingData } from "@/lib/onboarding/storage";

const INTERESTS = [
  { id: "Technology", icon: Cpu },
  { id: "Business", icon: Briefcase },
  { id: "Science", icon: FlaskConical },
  { id: "Movies", icon: Clapperboard },
  { id: "Books", icon: BookOpen },
  { id: "Gaming", icon: Gamepad2 },
  { id: "Music", icon: Music },
  { id: "Travel", icon: Plane },
  { id: "Sports", icon: Trophy },
  { id: "Food", icon: UtensilsCrossed },
] as const;

export default function InterestsPage() {
  const interests = useOnboardingData().interests;

  function toggle(id: string) {
    writeOnboardingData({
      interests: interests.includes(id) ? interests.filter((i) => i !== id) : [...interests, id],
    });
  }

  return (
    <OnboardingLayout step={6} totalSteps={7} variant="checklist">
      <Tuto pose="happy" size="md" animation="float" priority className="mx-auto mb-6" />
      <h2 className="mb-2 font-heading text-h1 font-bold text-text-primary">Your interests</h2>
      <p className="mb-8 text-body text-text-secondary">Pick a few topics — I&apos;ll use these for your content</p>

      <div className="mx-auto grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-3">
        {INTERESTS.map((option) => {
          const Icon = option.icon;
          const selected = interests.includes(option.id);
          return (
            <SelectableCard
              key={option.id}
              selected={selected}
              onClick={() => toggle(option.id)}
              className="flex items-center gap-2.5 px-4 py-3.5"
            >
              <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-text-tertiary")} />
              <span className={cn("text-small font-medium", selected ? "text-primary-dark" : "text-text-secondary")}>
                {option.id}
              </span>
              {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
            </SelectableCard>
          );
        })}
      </div>

      {interests.length > 0 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 text-caption text-text-tertiary">
          {interests.length} selected
        </motion.p>
      )}

      <OnboardingNav backHref="/daily-time" continueHref="/ready" continueDisabled={interests.length === 0} />
    </OnboardingLayout>
  );
}
