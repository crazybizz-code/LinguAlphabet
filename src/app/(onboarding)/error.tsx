"use client";

import { RouteError } from "@/components/layout/RouteError";

/** Full-bleed (no DashboardShell) — covers the onboarding wizard (welcome/name/level/goal/daily-time/interests/ready/ai-plan) against any unhandled render-time exception. */
export default function OnboardingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} fullBleed />;
}
