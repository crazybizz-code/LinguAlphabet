import { ProgressDots, type ProgressDotsProps } from "@/components/ui/ProgressDots";

export type OnboardingHeaderProps = Omit<ProgressDotsProps, "className">;

/**
 * Shared header for onboarding phases: brand lockup (left) + step-dot
 * progress (right). The Sign In / Sign Up / Forgot Password screens do
 * NOT use this — they nest their own brand lockup inside the hero
 * column with no step indicator, since they're gateway screens, not
 * numbered onboarding steps.
 */
export function OnboardingHeader(props: OnboardingHeaderProps) {
  return (
    <header className="flex items-start justify-between px-12 pt-8 max-md:flex-col max-md:gap-2 max-md:px-5 max-md:pt-[calc(16px+env(safe-area-inset-top))]">
      <div className="flex flex-col gap-0.5">
        <div className="text-h2 font-bold tracking-[-0.01em] text-text-primary">
          Lingu<span className="text-primary">Alphabet</span>
        </div>
        <p className="text-caption text-text-secondary">AI Coach for Language Mastery</p>
      </div>
      <ProgressDots {...props} className="max-md:pt-0" />
    </header>
  );
}
