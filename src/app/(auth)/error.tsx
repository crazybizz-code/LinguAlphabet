"use client";

import { RouteError } from "@/components/layout/RouteError";

/** Full-bleed (no DashboardShell) — covers login/signup/forgot-password/reset-password against any unhandled render-time exception. */
export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} fullBleed />;
}
