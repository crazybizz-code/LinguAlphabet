"use client";

import { track as vercelTrack } from "@vercel/analytics";
import type { AnalyticsEvent } from "./events";

/**
 * The one client-side track() every Client Component calls (server
 * actions/routes call recordEvent() from record.ts directly instead —
 * see /api/analytics/track's doc comment for the split). Dual-writes:
 * our own analytics_events table (the only thing the Product
 * Intelligence dashboard's KPI queries can actually read) and Vercel
 * Analytics's existing dashboard (already mounted in layout.tsx) for
 * free, real-time event volume/debugging without extra work.
 *
 * Fire-and-forget by design — an analytics call must never make a
 * learner wait, and never surface as a visible error for something they
 * didn't ask to happen.
 */
export function track(event: AnalyticsEvent): void {
  vercelTrack(event.name, event.properties as Record<string, string | number | boolean | null>);

  fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => {});
}
