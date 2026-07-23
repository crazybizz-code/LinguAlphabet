import type { LearningContext } from "@/ai/context";

/**
 * The client only ever knows a subset of LearningContext at any given
 * moment (whatever the current screen has on hand) — reusing the type
 * directly (not a parallel duplicate) keeps this in sync with the server
 * schema automatically. Type-only import: zero runtime/bundle cost, no
 * server code ships to the client.
 */
export type TutoContextInput = Partial<LearningContext>;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** In the conversation history sent to the server for continuity, but not rendered as a bubble (e.g. a vocabulary card already shown separately covers the same ground). */
  hidden?: boolean;
}
