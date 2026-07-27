import type { ConversationMemory } from "@/ai/data";

/**
 * Renders Conversation Memory (src/ai/data's ConversationRepository) into
 * a labeled prompt block — same "only what's populated, never fabricate"
 * rule as ./context-block.ts and ./learner-memory-block.ts. Deliberately
 * rendered as a plain recap under its own heading rather than replayed as
 * real user/assistant turns in the message array: this is a *memory of*
 * an earlier exchange, not the current one, and blurring the two would
 * make it ambiguous to the model (and to future debugging) which turns
 * actually happened in this request versus were recalled from storage.
 */
export function buildConversationMemoryBlock(memory?: ConversationMemory | null): string | null {
  if (!memory) return null;

  const lines: string[] = [];
  if (memory.currentContent) {
    lines.push(`Was last engaged with: the ${memory.currentContent.contentType} "${memory.currentContent.title}"`);
  }
  if (memory.recentMessages.length > 0) {
    const recap = memory.recentMessages.map((message) => `${message.role === "user" ? "Learner" : "Tuto"}: ${message.content}`).join("\n");
    lines.push(`Recent exchange:\n${recap}`);
  }

  return lines.length > 0 ? lines.join("\n\n") : null;
}
