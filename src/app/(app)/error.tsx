"use client";

import { useEffect } from "react";
import { Tuto } from "@/components/mascot/Tuto";
import { Button } from "@/components/ui/Button";

/**
 * Covers every route in the (app) group (Home/Explore/Progress/Profile/
 * Settings) — all of them do real Supabase Server Component fetches with
 * no error boundary of their own, so an unhandled throw (network blip,
 * .single() surprise) previously fell through to Next's raw default
 * error page. `reset()` re-renders the segment, retrying the fetch.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
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
