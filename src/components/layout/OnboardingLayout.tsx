import type { ReactNode } from "react";
import { ProgressDots, type ProgressDotsProps } from "@/components/ui/ProgressDots";

export interface OnboardingLayoutProps extends Omit<ProgressDotsProps, "className"> {
  children: ReactNode;
}

/**
 * Shared shell for the onboarding wizard screens: centered content, no
 * brand-lockup header (Base44's wizard has none — Tuto is the sole
 * visual anchor), step dots pinned to the bottom of the screen. This
 * replaced an earlier top-header + dots layout per product decision:
 * the dots belong at the bottom, not paired with the logo up top.
 */
export function OnboardingLayout({ children, ...dotsProps }: OnboardingLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-6 sm:py-16 max-md:px-5 max-md:py-8">
        <div className="w-full max-w-xl text-center">{children}</div>
      </div>
      <div className="flex justify-center pb-10 max-md:pb-[calc(20px+env(safe-area-inset-bottom))]">
        <ProgressDots {...dotsProps} />
      </div>
    </div>
  );
}
