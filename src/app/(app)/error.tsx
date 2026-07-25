"use client";

import { RouteError } from "@/components/layout/RouteError";

/**
 * Covers every route in the (app) group (Home/Explore/Progress/Profile/
 * Settings) — all of them do real Supabase Server Component fetches with
 * no error boundary of their own, so an unhandled throw (network blip,
 * .single() surprise) previously fell through to Next's raw default
 * error page. `reset()` re-renders the segment, retrying the fetch.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} />;
}
