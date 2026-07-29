"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics/client";

/**
 * Product Intelligence Sprint — DAU/WAU should count "used the product,"
 * not just "completed a lesson" (a learner reading Progress or chatting
 * with Tuto without finishing a lesson that day is still active). Mounted
 * once in (app)/layout.tsx, which persists across in-app navigation —
 * this fires session_started exactly once per real visit (tab open/
 * reload), not once per page view, and session_ended once when the tab
 * is hidden or closed.
 */
export function SessionTracker() {
  const pathname = usePathname();
  const startedAtRef = useRef<number | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    if (startedAtRef.current !== null) return;
    startedAtRef.current = Date.now();
    track({ name: "session_started", properties: { entryPath: pathname } });

    function endSession() {
      if (endedRef.current || startedAtRef.current === null) return;
      endedRef.current = true;
      track({ name: "session_ended", properties: { durationMs: Date.now() - startedAtRef.current } });
    }

    // "visibilitychange" -> hidden fires reliably on both tab-close and
    // switching away (mobile backgrounding included) — the one signal
    // that works consistently across desktop and mobile browsers, unlike
    // "beforeunload"/"unload" which mobile Safari/Chrome often skip
    // entirely. "pagehide" is a second safety net for the cases
    // visibilitychange doesn't cover (e.g. actual navigation away from
    // the origin, not just backgrounding).
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") endSession();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", endSession);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", endSession);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
