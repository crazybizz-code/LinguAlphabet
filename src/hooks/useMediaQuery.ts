"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe media query hook via useSyncExternalStore — the correct React
 * pattern for subscribing to external browser state (vs. useState +
 * useEffect, which would call setState synchronously inside the effect
 * body and trigger a cascading-render lint error). Returns false on the
 * server and during the first client render, then the real value.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);
      return () => mediaQueryList.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Matches this project's mobile tier (<768px). */
export function useIsMobile() {
  return useMediaQuery("(max-width: 767px)");
}
