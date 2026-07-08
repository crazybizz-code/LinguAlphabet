import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { SESSION_STEPS, SESSION_STEP_LABELS, type SessionStep } from "@/lib/learning-session/types";

const VISIBLE_STEPS: SessionStep[] = SESSION_STEPS.filter((step) => step !== "complete");

export function SessionStepper({ current }: { current: SessionStep }) {
  const currentIndex = VISIBLE_STEPS.indexOf(current);

  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2" role="progressbar" aria-label="Learning session progress" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={VISIBLE_STEPS.length}>
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
  );
}
