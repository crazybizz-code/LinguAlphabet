import type { AIProvider } from "@/ai/providers";
import type { ConversationMessage } from "@/ai/schemas";

/**
 * How many of the most recent user/assistant turns are always sent to the
 * model verbatim. A client resends its entire growing message history on
 * every turn (src/hooks/useTutoChat.ts) with no cap of its own, so without
 * a server-side window a long-running conversation would eventually exceed
 * the model's context — this is the fixed, predictable ceiling that
 * prevents that regardless of how long the client-side history grows.
 */
export const CONTEXT_WINDOW_MESSAGES = 20;

export interface ConversationWindow {
  /** Older messages, past the sliding window — never sent to the model verbatim, only (optionally) as a summary. */
  overflow: ConversationMessage[];
  /** The most recent messages, always sent verbatim. */
  recent: ConversationMessage[];
}

/**
 * Pure split of a conversation into what stays verbatim (the sliding
 * window) and what's old enough to need summarizing instead.
 */
export function splitConversationWindow(
  messages: ConversationMessage[],
  windowSize: number = CONTEXT_WINDOW_MESSAGES,
): ConversationWindow {
  if (messages.length <= windowSize) return { overflow: [], recent: messages };
  return {
    overflow: messages.slice(0, messages.length - windowSize),
    recent: messages.slice(messages.length - windowSize),
  };
}

function formatForSummary(messages: ConversationMessage[]): string {
  return messages
    .filter((message): message is ConversationMessage & { role: "user" | "assistant" } => message.role === "user" || message.role === "assistant")
    .map((message) => `${message.role === "user" ? "Learner" : "Tuto"}: ${message.content}`)
    .join("\n");
}

/**
 * Best-effort summary of the overflow portion of a long conversation, so
 * the model keeps continuity beyond the sliding window without ever
 * re-sending the full unbounded history. Mirrors classifyTurn()'s
 * (src/ai/turn-classifier) convention for a secondary, non-critical AI
 * call: returns null on any failure rather than guessing or blocking the
 * actual reply — a missing summary degrades context, it never breaks the
 * turn.
 */
export async function summarizeOverflow(overflow: ConversationMessage[], provider: AIProvider): Promise<string | null> {
  if (overflow.length === 0) return null;

  try {
    const result = await provider.complete({
      messages: [
        {
          role: "system",
          content:
            "Summarize the following earlier part of a conversation between an English-learning coach (Tuto) and a learner, in 2-4 short sentences. Focus on what topics were covered, what the learner struggled with or asked about, and any decisions made. Output only the summary text, with no greeting or preamble.",
        },
        { role: "user", content: formatForSummary(overflow) },
      ],
      temperature: 0.3,
      maxTokens: 200,
    });
    const summary = result.content.trim();
    return summary.length > 0 ? summary : null;
  } catch {
    return null;
  }
}
