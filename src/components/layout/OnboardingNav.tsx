"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export interface OnboardingNavProps {
  /** Omit to hide the Back button (e.g. the first step of a flow). */
  backHref?: string;
  continueHref: string;
  continueDisabled?: boolean;
  continueLabel?: string;
  pending?: boolean;
}

/** Shared Back/Continue row for onboarding wizard steps (Base44 spec). */
export function OnboardingNav({
  backHref,
  continueHref,
  continueDisabled = false,
  continueLabel = "Continue",
  pending = false,
}: OnboardingNavProps) {
  const router = useRouter();

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
        onClick={() => router.push(continueHref)}
      >
        {continueLabel}
      </Button>
    </div>
  );
}
