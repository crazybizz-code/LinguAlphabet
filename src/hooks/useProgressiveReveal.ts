"use client";

import { useEffect, useRef, useState } from "react";

const CHARS_PER_SECOND = 60;
const MAX_REVEAL_MS = 900;
const MIN_REVEAL_MS = 150;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Sprint UX-1 (Living Tuto): a client-side "reveal" effect layered purely
 * on top of whatever text already arrived — the AI Service yields a
 * registered-tools response as one complete chunk, not real incremental
 * tokens (docs/ai-architecture.md's "Streaming + tools" note), so this is
 * what actually produces the felt sense of streaming, without touching
 * how the backend sends data. `active` false snaps instantly to `target`
 * — used once a message stops being "the one currently arriving".
 */
export function useProgressiveReveal(target: string, active: boolean): string {
  const [displayed, setDisplayed] = useState(target);
  const [tracked, setTracked] = useState({ target, active });
  // Refs are only ever touched inside the effect below, never during
  // render (React's rule — a ref read/written during render can silently
  // desync from what was actually committed).
  const revealedRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  // Snap instantly during render for the "not animating" cases — React's
  // documented pattern for adjusting state from changed props (already
  // used in this codebase, e.g. DictionaryOverlay's word-change reset),
  // so this never triggers a synchronous setState-in-effect chain.
  if (tracked.target !== target || tracked.active !== active) {
    setTracked({ target, active });
    const shouldAnimate = active && target.length > 0 && !prefersReducedMotion();
    if (!shouldAnimate) setDisplayed(target);
  }

  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    const shouldAnimate = active && target.length > 0 && !prefersReducedMotion();
    if (!shouldAnimate) {
      revealedRef.current = target; // already snapped to target during render above
      return;
    }

    // A continuation of what's already shown (more of the same message)
    // resumes from where it left off; a different message starts fresh.
    const alreadyRevealed = target.startsWith(revealedRef.current) ? revealedRef.current : "";
    const startLength = alreadyRevealed.length;
    const charsToReveal = target.length - startLength;
    if (charsToReveal <= 0) {
      revealedRef.current = target;
      return;
    }

    const durationMs = Math.min(MAX_REVEAL_MS, Math.max(MIN_REVEAL_MS, (charsToReveal / CHARS_PER_SECOND) * 1000));
    const startTime = performance.now();

    function step(now: number) {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const nextLength = startLength + Math.round(charsToReveal * progress);
      const next = target.slice(0, nextLength);
      revealedRef.current = next;
      setDisplayed(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    }
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, active]);

  return displayed;
}
