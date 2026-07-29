"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./useProgressiveReveal";

const WORDS_PER_CHUNK = 3;
const BASE_CHUNK_MS = 42;
/** Extra pause after a chunk ending mid-sentence at a comma/semicolon/colon — a small breath, not a full stop. */
const CLAUSE_PAUSE_MS = 55;
/** Extra pause after a chunk ending a sentence (./!/?, optionally followed by a closing quote/bracket) — long enough to read as "that thought finished," short enough to stay responsive. */
const SENTENCE_PAUSE_MS = 130;
/** Extra pause when a chunk crosses into a new paragraph — the biggest beat, matching how a person actually pauses between ideas. */
const PARAGRAPH_PAUSE_MS = 200;
const MIN_REVEAL_MS = 150;

const SENTENCE_END_PATTERN = /[.!?]["')\]]?$/;
const CLAUSE_END_PATTERN = /[,;:]$/;

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

/**
 * How long to hold before revealing the chunk AFTER this one — human
 * reading rhythm, not a uniform tick: a beat after a clause, a longer one
 * after a full sentence, longer still across a paragraph break. Shared by
 * both useChunkedReveal's own timer and estimateChunkedRevealDurationMs
 * below so the two can never drift out of sync with each other.
 */
function delayAfterChunk(chunk: string): number {
  if (/\n\s*\n/.test(chunk)) return BASE_CHUNK_MS + PARAGRAPH_PAUSE_MS;
  const trimmed = chunk.trimEnd();
  if (SENTENCE_END_PATTERN.test(trimmed)) return BASE_CHUNK_MS + SENTENCE_PAUSE_MS;
  if (CLAUSE_END_PATTERN.test(trimmed)) return BASE_CHUNK_MS + CLAUSE_PAUSE_MS;
  return BASE_CHUNK_MS;
}

/**
 * Total time this hook will actually take to reveal `text` in full,
 * computed from the exact same per-chunk pacing the reveal loop uses —
 * exported so a caller that needs to time something to "once the reveal
 * settles" (Tuto Workspace's quick-action-chip delay, ChatBubble's own
 * cursor-hide timer) matches this hook's real pacing instead of a
 * separately-guessed duration that could drift out of sync. Deliberately
 * uncapped on the high end: a longer, multi-paragraph reply taking
 * proportionally longer to "read out" IS the natural pacing this hook
 * exists for, not something to rush to hit an arbitrary ceiling.
 */
export function estimateChunkedRevealDurationMs(text: string): number {
  const chunks = splitIntoChunks(text, WORDS_PER_CHUNK);
  if (chunks.length === 0) return MIN_REVEAL_MS;
  const total = chunks.reduce((sum, chunk) => sum + delayAfterChunk(chunk), 0);
  return Math.max(MIN_REVEAL_MS, total);
}

/**
 * Tuto Workspace's reveal effect (Production Polish Sprint): reveals a
 * few words at a time on a human-paced cadence, not one character at a
 * time on every animation frame — both because a chat reply reads more
 * like phrases being written than a typewriter, and because the old
 * rAF-driven character interpolation re-rendered (and re-ran
 * renderTutoMarkdown's parse over) the whole bubble up to 60 times/second;
 * stepping by chunk cuts that by roughly an order of magnitude. Legacy's
 * TutoChatPanel keeps using useProgressiveReveal's character-by-character
 * animation unchanged — this is a separate hook, not a modification of
 * that one, specifically so the legacy sheet's feel never changes.
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

    let base = alreadyRevealed;
    let index = 0;

    function revealNextChunk() {
      const chunk = chunks[index];
      base += chunk;
      index += 1;
      revealedRef.current = base;
      setDisplayed(base);
      if (index < chunks.length) {
        timeoutRef.current = setTimeout(revealNextChunk, delayAfterChunk(chunk));
      }
    }
    timeoutRef.current = setTimeout(revealNextChunk, delayAfterChunk(""));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [target, active]);

  return displayed;
}
