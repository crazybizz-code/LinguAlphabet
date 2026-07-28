import type { ChatMessage, TutoContextInput } from "./types";

/**
 * Mirrors src/ai/learning-orchestrator's OrchestratorAction as a plain
 * string union rather than importing the type — this module ships to the
 * browser and src/ai/learning-orchestrator is server-only AI architecture;
 * duplicating just the string literals here (not the logic) keeps that
 * boundary intact the same way TutoContextInput already does for
 * LearningContext.
 */
export type ChatOrchestratorAction = "continue" | "repeat" | "simplify" | "give-hint" | "celebrate" | "skip" | "escalate" | "finish";

export type ChatStreamEvent =
  | { type: "delta"; content: string }
  | { type: "done"; orchestratorAction?: ChatOrchestratorAction | null; quickActions?: string[] }
  | { type: "error"; message: string };

/**
 * Client-side counterpart to src/app/api/ai/chat/route.ts's SSE output —
 * parses the exact same `data: {...}\n\n` frames the server emits. Not new
 * AI infrastructure: this is ordinary fetch/ReadableStream parsing of an
 * existing, already-shipped API contract, the ui-layer piece every SSE
 * consumer needs since the browser's native EventSource can't POST a body.
 */
export async function* streamChatCompletion(
  messages: Array<Pick<ChatMessage, "role" | "content">>,
  context: TutoContextInput,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, context }),
    signal,
  });

  if (!response.ok || !response.body) {
    yield { type: "error", message: await extractErrorMessage(response) };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload) continue;

        try {
          const event = JSON.parse(payload) as ChatStreamEvent;
          yield event;
          if (event.type === "done" || event.type === "error") return;
        } catch {
          // Malformed/partial frame — skip it rather than crash the stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // fall through to the generic message
  }
  return "Something went wrong reaching Tuto.";
}
