import type { ConversationMemoryMessage } from "@/ai/data";

/**
 * Client-side counterpart to /api/ai/chat's new GET handler — reads back
 * whatever ConversationMemory the server already persisted (src/ai/data's
 * ConversationRepository), the same recentMessages every chat turn already
 * reads/writes server-side. Type-only import of ConversationMemoryMessage:
 * zero runtime/bundle cost, no server code ships to the client (same
 * pattern as TutoContextInput in ./types.ts).
 */
export async function getRecentConversation(): Promise<ConversationMemoryMessage[]> {
  try {
    const response = await fetch("/api/ai/chat", { method: "GET" });
    if (!response.ok) return [];

    const data: unknown = await response.json();
    if (data && typeof data === "object" && "messages" in data && Array.isArray(data.messages)) {
      return data.messages as ConversationMemoryMessage[];
    }
    return [];
  } catch {
    return [];
  }
}
