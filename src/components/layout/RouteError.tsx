"use client";

import { useEffect } from "react";
import { Tuto } from "@/components/mascot/Tuto";
import { Button } from "@/components/ui/Button";

export interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Full-bleed routes (Learning Session, auth, onboarding — outside DashboardShell) need the full viewport; shell-wrapped routes only need to fill the shell's own content area. */
  fullBleed?: boolean;
}

/**
 * Beta stability fix: shared branded error boundary — previously only the
 * (app) route group had one (src/app/(app)/error.tsx), so an unhandled
 * throw anywhere else (the Learning Session, auth, onboarding — all of
 * which do real Supabase calls with no error boundary of their own) fell
 * through to the bare, unstyled global-error.tsx instead of a real recovery
 * screen. One shared component so every boundary stays visually identical
 * and there's a single place to maintain this, rather than four copies.
 */
export function RouteError({ error, reset, fullBleed = false }: RouteErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 px-6 text-center ${fullBleed ? "min-h-dvh bg-bg" : "min-h-[70vh]"}`}
    >
      <Tuto pose="thinking" size="md" animation="breathe" />
      <div>
        <h1 className="font-heading text-h1 font-bold text-text-primary">Something went wrong</h1>
        <p className="mt-2 text-body text-text-secondary">Tuto hit a snag loading this page. Let&apos;s try again.</p>
      </div>
      <Button variant="primary" className="h-12 rounded-full px-8" onClick={() => reset()}>
        Try Again
      </Button>
    </div>
  );
}
