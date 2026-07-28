"use client";

import { useSyncExternalStore } from "react";

export interface VisualViewportMetrics {
  height: number;
  offsetTop: number;
}

let cachedSnapshot: VisualViewportMetrics | null = null;

function subscribe(onStoreChange: () => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener("resize", onStoreChange);
  vv.addEventListener("scroll", onStoreChange);
  return () => {
    vv.removeEventListener("resize", onStoreChange);
    vv.removeEventListener("scroll", onStoreChange);
  };
}

/**
 * `useSyncExternalStore` requires a referentially stable snapshot when
 * nothing actually changed — returning a fresh `{ height, offsetTop }`
 * object literal on every call (React calls this on every render to check
 * for tearing) would make every render look like a change and thrash.
 * There's only ever one real `window.visualViewport`, so caching the last
 * snapshot at module scope — shared across every component using this
 * hook — is correct, not just an optimization.
 */
function getSnapshot(): VisualViewportMetrics | null {
  const vv = window.visualViewport;
  if (!vv) return null;
  if (cachedSnapshot && cachedSnapshot.height === vv.height && cachedSnapshot.offsetTop === vv.offsetTop) {
    return cachedSnapshot;
  }
  cachedSnapshot = { height: vv.height, offsetTop: vv.offsetTop };
  return cachedSnapshot;
}

function getServerSnapshot(): VisualViewportMetrics | null {
  return null;
}

/**
 * Tracks the browser's actual visible viewport (`window.visualViewport`) —
 * unlike the layout viewport (and `dvh`, which follows it), this shrinks
 * and offsets when a mobile on-screen keyboard opens, on both Android
 * Chrome and iOS Safari (both have supported the Visual Viewport API for
 * years). `null` on the server, on first client render, and in any
 * browser without the API — callers should fall back to a static
 * viewport unit (`h-dvh`) in that case, exactly like every other
 * `dvh`/`svh` fallback cascade already used in this codebase
 * (e.g. EditSheet.tsx's SHEET_HEIGHT_CLASSES).
 */
export function useVisualViewport(): VisualViewportMetrics | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
