"use client";

import { useEffect, useRef, useState } from "react";

const READING_MS = 550;

export type ThinkingPhase = "reading" | "thinking";

/**
 * A pacing affordance over the one real wait a learner already experiences
 * between sending a message and Tuto's reply arriving — src/ai/services/
 * ai-service.ts's streamResponse() always yields one complete answer, never
 * real incremental tokens, once tools are involved (docs/ai-architecture.md's
 * "Streaming + tools" note), so there's no second real backend phase to
 * report here. "Reading" acknowledges the message was received; "Thinking"
 * covers however long the actual wait turns out to be — never a fabricated
 * specific activity (the same honesty rule ThinkingTimeline's generic steps
 * already follow for the legacy sheet).
 */
export function useThinkingPhase(active: boolean): ThinkingPhase {
  const [phase, setPhase] = useState<ThinkingPhase>("reading");
  const [trackedActive, setTrackedActive] = useState(active);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restarts the sequence during render whenever `active` toggles — React's
  // documented pattern for adjusting state from a changed prop (already used
  // elsewhere in this codebase, e.g. ThinkingTimeline's own focus reset),
  // rather than a setState call sitting at the top of the effect below.
  if (trackedActive !== active) {
    setTrackedActive(active);
    setPhase("reading");
  }

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!active) return;
    timeoutRef.current = setTimeout(() => setPhase("thinking"), READING_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [active]);

  return phase;
}
