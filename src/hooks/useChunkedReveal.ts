"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./useProgressiveReveal";

const WORDS_PER_CHUNK = 3;
const MS_PER_CHUNK = 55;
const MIN_REVEAL_MS = 150;
const MAX_REVEAL_MS = 900;

/**
 * Splits `text` into whitespace-preserving chunks of `wordsPerChunk` words
 * each — concatenating the result in order always reconstructs `text`
 * exactly (no whitespace/newline is ever dropped or reordered), which
 * matters for renderTutoMarkdown's block/list detection downstream.
 */
function splitIntoChunks(text: string, wordsPerChunk: number): string[] {
  const tokens = text.split(/(\s+)/);
  const chunks: string[] = [];
  let current = "";
  let wordsInCurrent = 0;

  for (const token of tokens) {
    current += token;
    if (token.trim().length === 0) continue;
    wordsInCurrent += 1;
    if (wordsInCurrent >= wordsPerChunk) {
      chunks.push(current);
      current = "";
      wordsInCurrent = 0;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Same clamped-duration shape as useProgressiveReveal's estimateRevealDurationMs, keyed on chunk count rather than character count — exported so a caller (Tuto Workspace's quick-action-chip delay) can match this hook's actual pacing instead of the character-based formula, which no longer applies once revealing happens in chunks. */
export function estimateChunkedRevealDurationMs(text: string): number {
  const chunkCount = splitIntoChunks(text, WORDS_PER_CHUNK).length;
  return Math.min(MAX_REVEAL_MS, Math.max(MIN_REVEAL_MS, chunkCount * MS_PER_CHUNK));
}

/**
 * Tuto Workspace's reveal effect (Production Polish Sprint): reveals a
 * few words at a time on a fixed cadence, not one character at a time on
 * every animation frame — both because a chat reply reads more like
 * something being "written" in phrases than a typewriter, and because the
 * old rAF-driven character interpolation re-rendered (and re-ran
 * renderTutoMarkdown's regex parse over) the whole bubble up to 60
 * times/second; stepping by chunk on a ~55ms timer cuts that by roughly
 * an order of magnitude. Legacy's TutoChatPanel keeps using
 * useProgressiveReveal's character-by-character animation unchanged —
 * this is a separate hook, not a modification of that one, specifically
 * so the legacy sheet's feel never changes.
 */
export function useChunkedReveal(target: string, active: boolean): string {
  const [displayed, setDisplayed] = useState(target);
  const [tracked, setTracked] = useState({ target, active });
  // Refs are only ever touched inside the effect below, never during
  // render — same rule useProgressiveReveal follows.
  const revealedRef = useRef(target);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (tracked.target !== target || tracked.active !== active) {
    setTracked({ target, active });
    const shouldAnimate = active && target.length > 0 && !prefersReducedMotion();
    if (!shouldAnimate) setDisplayed(target);
  }

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const shouldAnimate = active && target.length > 0 && !prefersReducedMotion();
    if (!shouldAnimate) {
      revealedRef.current = target;
      return;
    }

    const alreadyRevealed = target.startsWith(revealedRef.current) ? revealedRef.current : "";
    const remaining = target.slice(alreadyRevealed.length);
    if (remaining.length === 0) {
      revealedRef.current = target;
      return;
    }

    const chunks = splitIntoChunks(remaining, WORDS_PER_CHUNK);
    const intervalMs = estimateChunkedRevealDurationMs(remaining) / chunks.length;

    let base = alreadyRevealed;
    let index = 0;

    function revealNextChunk() {
      base += chunks[index];
      index += 1;
      revealedRef.current = base;
      setDisplayed(base);
      if (index < chunks.length) {
        timeoutRef.current = setTimeout(revealNextChunk, intervalMs);
      }
    }
    timeoutRef.current = setTimeout(revealNextChunk, intervalMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [target, active]);

  return displayed;
}
