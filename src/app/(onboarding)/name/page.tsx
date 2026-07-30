"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Tuto } from "@/components/mascot/Tuto";
import { Input } from "@/components/ui/Input";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { OnboardingNav } from "@/components/layout/OnboardingNav";
import { useOnboardingData, writeOnboardingData } from "@/lib/onboarding/storage";

export default function NamePage() {
  const router = useRouter();
  const name = useOnboardingData().displayName;

  return (
    <OnboardingLayout step={2} totalSteps={7} variant="checklist">
      <Tuto pose="listening" size="md" animation="floatSm" priority className="mx-auto mb-6" />
      <h1 className="mb-2 font-heading text-h1 font-bold text-text-primary">What&apos;s your name?</h1>
      <p className="mb-8 text-body text-text-secondary">So I can personalize your experience</p>

      <div className="mx-auto max-w-xs">
        <Input
          value={name}
          onChange={(event) => writeOnboardingData({ displayName: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) router.push("/level");
          }}
          placeholder="Enter your name"
          autoFocus
          className="text-center text-lg"
        />
      </div>

      {name.trim() && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-small font-medium text-primary"
        >
          Nice to meet you, {name.trim()}!
        </motion.p>
      )}

      <OnboardingNav backHref="/welcome" continueHref="/level" continueDisabled={!name.trim()} step="name" stepIndex={2} />
    </OnboardingLayout>
  );
}
