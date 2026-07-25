import type { ThinkingFocus } from "@/components/tuto-chat/ThinkingTimeline";

/**
 * Sprint UX-2 (Interactive Teaching): frontend-only suggestion banks —
 * no AI call, no prompt change. These are deterministic heuristics
 * standing in for what a real per-turn recommendation would eventually
 * be (Sprint 9/10's knowledge base and learner profile could genuinely
 * drive this later, but wiring that up is a backend/prompt change this
 * sprint explicitly excludes).
 */

const DEFAULT_QUICK_REPLIES = ["Got it, thanks!", "Can you give an example?", "I'm still confused"];
const QUESTION_QUICK_REPLIES = ["Yes", "Not quite", "Can you explain differently?"];

/** A different, still-natural set when Tuto's last message ended in a question — a plain "yes/no" reply reads oddly otherwise. */
export function getQuickReplies(lastAssistantContent: string): string[] {
  const endsWithQuestion = /\?\s*$/.test(lastAssistantContent.trim());
  return endsWithQuestion ? QUESTION_QUICK_REPLIES : DEFAULT_QUICK_REPLIES;
}

const FOLLOW_UP_BY_FOCUS: Record<"grammar" | "vocabulary" | "article", string[]> = {
  grammar: ["What's a common mistake learners make with this?", "How is this different from a similar tense?"],
  vocabulary: ["Can you use this word in a different sentence?", "What's a word that means the opposite?"],
  article: ["What's the main idea of this article?", "Can you summarize this in two sentences?"],
};
const GENERIC_FOLLOW_UPS = ["Can we practice this together?", "What should I focus on next?"];

/** `seed` keeps the pick stable across re-renders of the same message (turnIndex works well) rather than flickering between options. */
export function getFollowUpSuggestion(focus: ThinkingFocus, seed: number): string {
  const pool = focus ? FOLLOW_UP_BY_FOCUS[focus] : GENERIC_FOLLOW_UPS;
  return pool[seed % pool.length];
}
