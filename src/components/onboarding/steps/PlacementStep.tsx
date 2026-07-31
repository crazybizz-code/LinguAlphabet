"use client";

import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { OnboardingContinue } from "../OnboardingStepShell";

/**
 * Step 7. Deliberately does not use OnboardingStepShell: this is the
 * hand-off moment rather than another question, so it carries a larger
 * Tuto, a longer two-paragraph explanation, a duration chip and a wider
 * CTA. Forcing it into the question frame would flatten exactly the
 * emphasis the flow has been building toward.
 *
 * The copy is honest about what the earlier answers are worth — they
 * personalize, the assessment measures — which is what stops the
 * preceding six screens from feeling like they were ignored.
 */
export function PlacementStep({ onStart, saving }: { onStart: () => void; saving: boolean }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <Tuto pose="typing-laptop" size="xl" animation="float" className="mx-auto mb-8" alt="" />

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="mb-4 font-heading text-2xl font-extrabold leading-tight text-text-primary sm:text-3xl"
      >
        Let&apos;s discover your real IELTS level.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="mb-4 leading-relaxed text-text-secondary"
      >
        Your answers help us personalize your experience, but the placement assessment gives us the most accurate
        picture.
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mb-8 leading-relaxed text-text-secondary"
      >
        Complete a short Reading and Listening assessment, and Tuto will create a personalized IELTS study plan based on
        your performance.
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mb-8 inline-flex items-center gap-2 rounded-full bg-bg-muted px-4 py-2"
      >
        <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-medium text-text-secondary">About 15 minutes</span>
      </motion.p>

      <div>
        <OnboardingContinue onClick={onStart} loading={saving} size="lg">
          Start Assessment
        </OnboardingContinue>
      </div>
    </div>
  );
}
