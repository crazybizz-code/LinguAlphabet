"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { CURRENT_BAND_OPTIONS, TARGET_BAND_OPTIONS } from "@/lib/onboarding/constants";
import {
  INITIAL_ONBOARDING_DATA,
  ONBOARDING_STEPS,
  TOTAL_STEPS,
  canAdvance,
  isTargetBandTooLow,
  type OnboardingData,
} from "@/lib/onboarding/types";
import { NameStep } from "./steps/NameStep";
import { ExamStep } from "./steps/ExamStep";
import { BandStep } from "./steps/BandStep";
import { ExamDateStep } from "./steps/ExamDateStep";
import { DailyTimeStep } from "./steps/DailyTimeStep";
import { PlacementStep } from "./steps/PlacementStep";

/**
 * The IELTS onboarding wizard.
 *
 * Deliberately ONE route holding seven steps rather than seven routes.
 * The handoff's step transition is a horizontal slide with the outgoing
 * screen exiting left as the incoming one enters right, under
 * AnimatePresence `mode="wait"` — that is a single-container animation
 * and cannot be reproduced by full page navigations, which repaint. It is
 * also what makes back navigation preserve every answer for free: the
 * data never leaves component state, so returning to a step re-renders
 * the selection rather than refetching it.
 */
export interface OnboardingWizardProps {
  /** Persists the collected answers AND marks onboarding complete. Rejecting keeps the learner on the final screen with a retry — see handleFinish. */
  onComplete: (data: OnboardingData) => Promise<void>;
  /** Where to send the learner once their answers are saved. */
  destination: string;
}

export function OnboardingWizard({ onComplete, destination }: OnboardingWizardProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const step = ONBOARDING_STEPS[stepIndex];
  const update = useCallback(<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setData((previous) => ({ ...previous, [key]: value }));
  }, []);

  const targetTooLow = isTargetBandTooLow(data);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onComplete(data);
    } catch (error) {
      // Navigating anyway is NOT safe here. Completion is what sets
      // onboarding_completed, and every authenticated route guards on it
      // — so pushing to the dashboard after a failed write sends the
      // learner into an unexplained redirect loop back to this wizard.
      // Far better to stay put, say what happened, and let them retry.
      setSaving(false);
      setSaveError(error instanceof Error ? error.message : "Something went wrong saving your answers.");
      return;
    }
    router.push(destination);
  }, [data, destination, onComplete, router]);

  const goNext = useCallback(() => {
    if (stepIndex < TOTAL_STEPS - 1) {
      setStepIndex((index) => index + 1);
    } else {
      void handleFinish();
    }
  }, [handleFinish, stepIndex]);

  const goBack = useCallback(() => setStepIndex((index) => Math.max(0, index - 1)), []);

  const progress = ((stepIndex + 1) / TOTAL_STEPS) * 100;

  return (
    <div className="flex min-h-dvh flex-col bg-bg-card">
      {/* Continuous progress bar pinned to the very top edge. */}
      <div className="fixed inset-x-0 top-0 z-50">
        <div
          className="h-1 bg-bg-muted"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-label={`Step ${stepIndex + 1} of ${TOTAL_STEPS}`}
        >
          <motion.div
            className="h-full rounded-r-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      {stepIndex > 0 && (
        <motion.button
          type="button"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={goBack}
          aria-label="Go back"
          className="fixed left-5 top-5 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-card/80 shadow-soft backdrop-blur-md transition-all hover:bg-bg-card hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ArrowLeft className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        </motion.button>
      )}

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-20 sm:px-6">
        <div className="w-full max-w-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === "name" && (
                <NameStep value={data.displayName} onChange={(value) => update("displayName", value)} onNext={goNext} />
              )}

              {step === "exam" && (
                <ExamStep selected={data.examType} onSelect={(exam) => update("examType", exam)} onNext={goNext} />
              )}

              {step === "currentBand" && (
                <BandStep
                  pose="thinking"
                  title="What's your current IELTS band?"
                  subtitle={`Use your latest IELTS or mock test score. If you're not sure, choose "Not sure".`}
                  options={CURRENT_BAND_OPTIONS}
                  value={data.currentBand}
                  onSelect={(band) => {
                    update("currentBand", band);
                    update("currentBandUnsure", false);
                  }}
                  unsure={data.currentBandUnsure}
                  onUnsure={() => {
                    update("currentBandUnsure", true);
                    update("currentBand", null);
                  }}
                  onNext={goNext}
                  canProceed={canAdvance("currentBand", data)}
                />
              )}

              {step === "targetBand" && (
                <BandStep
                  pose="celebrating"
                  title="What's your target IELTS band?"
                  subtitle="Choose the band score you want to achieve."
                  options={TARGET_BAND_OPTIONS}
                  value={data.targetBand}
                  onSelect={(band) => update("targetBand", band)}
                  onNext={goNext}
                  canProceed={canAdvance("targetBand", data)}
                  warning={targetTooLow ? "Your target band should be higher than your current band." : null}
                />
              )}

              {step === "examDate" && (
                <ExamDateStep
                  selected={data.examTimeline}
                  onSelect={(timeline) => update("examTimeline", timeline)}
                  onNext={goNext}
                />
              )}

              {step === "dailyTime" && (
                <DailyTimeStep
                  selected={data.dailyTime}
                  onSelect={(minutes) => update("dailyTime", minutes)}
                  onNext={goNext}
                />
              )}

              {step === "placement" && (
                <PlacementStep onStart={() => void handleFinish()} saving={saving} error={saveError} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Step dots: completed and current both read as a filled pill, so
          the eye tracks one growing run rather than counting dots. */}
      <div className="flex justify-center gap-1.5 pb-8 max-md:pb-[calc(20px+env(safe-area-inset-bottom))]" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
          <span
            key={index}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              index < stepIndex
                ? "w-6 bg-primary"
                : index === stepIndex
                  ? "w-6 bg-[#FFC89A]"
                  : "w-1.5 bg-[#E2E8F0]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
