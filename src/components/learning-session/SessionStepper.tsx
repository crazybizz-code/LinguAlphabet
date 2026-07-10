import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { ProgressDots } from "@/components/ui/ProgressDots";
import { SESSION_STEPS, SESSION_STEP_LABELS, type SessionStep } from "@/lib/learning-session/types";

const VISIBLE_STEPS: SessionStep[] = SESSION_STEPS.filter((step) => step !== "complete");

/**
 * Six full badge+label pairs never fit on a phone-width header without
 * squeezing — "Vocabulary" and "Flashcards" alone are wider than the space
 * six columns can share on a 375px screen. Below `md` this collapses to a
 * compact "Step X of Y · <current label>" caption over ProgressDots
 * (checklist variant, already the app's own compact-stepper pattern from
 * onboarding) — readable at a glance without cramming anything. Tablet/
 * desktop keeps the full per-step row, which has the width for it.
 */
export function SessionStepper({ current }: { current: SessionStep }) {
  const currentIndex = VISIBLE_STEPS.indexOf(current);

  return (
    <div
      role="progressbar"
      aria-label="Learning session progress"
      aria-valuenow={currentIndex + 1}
      aria-valuemin={1}
      aria-valuemax={VISIBLE_STEPS.length}
    >
      <div className="hidden flex-col items-center gap-1.5 max-md:flex">
        <p className="text-xs font-semibold text-text-tertiary">
          Step {currentIndex + 1} of {VISIBLE_STEPS.length}
          <span className="text-text-primary"> · {SESSION_STEP_LABELS[current]}</span>
        </p>
        <ProgressDots step={currentIndex + 1} variant="checklist" totalSteps={VISIBLE_STEPS.length} className="pt-0" />
      </div>

      <div className="flex items-center justify-center gap-1.5 max-md:hidden sm:gap-2">
        {VISIBLE_STEPS.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <div key={step} className="contents">
              <div className="flex flex-col items-center gap-1">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                    isDone
                      ? "bg-primary text-text-on-primary"
                      : isCurrent
                        ? "bg-primary text-text-on-primary ring-4 ring-primary-lighter"
                        : "bg-bg-muted text-text-tertiary"
                  }`}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </motion.div>
                <span className={`text-[10px] font-medium ${isCurrent ? "text-text-primary" : "text-text-tertiary"}`}>
                  {SESSION_STEP_LABELS[step]}
                </span>
              </div>
              {index < VISIBLE_STEPS.length - 1 && (
                <div className={`h-0.5 w-4 rounded-full transition-all duration-300 sm:w-8 ${isDone ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
