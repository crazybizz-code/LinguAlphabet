"use client";

import { RouteError } from "@/components/layout/RouteError";

/** Full-bleed (no DashboardShell) — mirrors loading.tsx's fullBleed. Catches an unhandled throw from getArticleById or the profile query in page.tsx. */
export default function LearnError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} fullBleed />;
}
