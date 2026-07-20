"use client";

import { motion } from "framer-motion";
import { Tuto } from "@/components/mascot/Tuto";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { OnboardingNav } from "@/components/layout/OnboardingNav";
import { useOnboardingData } from "@/lib/onboarding/storage";

export default function ReadyPage() {
  const displayName = useOnboardingData().displayName;

  return (
    <OnboardingLayout step={7} totalSteps={7} variant="checklist">
      <Tuto pose="celebrating" size="lg" animation="breathe" priority className="mx-auto mb-8" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="mx-auto max-w-md"
      >
        <h1 className="mb-4 font-heading text-display font-extrabold leading-tight text-text-primary">
          You&apos;re going to do amazing{displayName ? `, ${displayName}` : ""}.
        </h1>
        <p className="text-body leading-relaxed text-text-secondary">
          Based on your English level, your learning goal, daily learning time, and interests, I&apos;ve
          created the perfect English learning path just for you.
        </p>
      </motion.div>

      <OnboardingNav backHref="/interests" continueHref="/ai-plan" continueLabel="Continue" />
    </OnboardingLayout>
  );
}
