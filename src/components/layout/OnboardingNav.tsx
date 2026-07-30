"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics/client";
import type { OnboardingStepCompletedProperties } from "@/lib/analytics/events";

export interface OnboardingNavProps {
  /** Omit to hide the Back button (e.g. the first step of a flow). */
  backHref?: string;
  continueHref: string;
  continueDisabled?: boolean;
  continueLabel?: string;
  pending?: boolean;
  /**
   * Product Intelligence Sprint — every onboarding step funnels through
   * this one shared component, so this is the one place
   * onboarding_step_completed needs to fire, rather than duplicating a
   * track() call across six page files. Omit on a step that isn't part
   * of the tracked funnel (welcome's own custom CTA doesn't use
   * OnboardingNav at all).
   */
  step?: OnboardingStepCompletedProperties["step"];
  stepIndex?: number;
}

/** Shared Back/Continue row for onboarding wizard steps (Base44 spec). */
export function OnboardingNav({
  backHref,
  continueHref,
  continueDisabled = false,
  continueLabel = "Continue",
  pending = false,
  step,
  stepIndex,
}: OnboardingNavProps) {
  const router = useRouter();

  function handleContinue() {
    if (step && stepIndex !== undefined) {
      track({ name: "onboarding_step_completed", properties: { step, stepIndex } });
    }
    router.push(continueHref);
  }

  return (
    <div className="mx-auto mt-10 flex max-w-md items-center justify-between">
      {backHref ? (
        <Button
          variant="ghost"
          className="h-auto rounded-full px-4 py-2 text-text-tertiary hover:text-text-secondary"
          onClick={() => router.push(backHref)}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button
        variant="primary"
        className="h-11 rounded-full px-8"
        disabled={continueDisabled}
        loading={pending}
        arrow
        onClick={handleContinue}
      >
        {continueLabel}
      </Button>
    </div>
  );
}
