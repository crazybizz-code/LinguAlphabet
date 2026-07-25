/**
 * Sprint UX-3 (Adaptive Teaching): pulls the first **bolded** term out of
 * Tuto's own reply text — a real signal taken from the actual response
 * (Tuto's system prompt already tends to bold the key term being taught,
 * e.g. "The **present perfect** connects..."), not a fabricated or
 * AI-generated-on-demand summary. Returns null when nothing is bolded,
 * same "never invent a value that wasn't provided" rule every other
 * frontend-only heuristic in this codebase follows.
 */
export function extractLessonTopic(content: string): string | null {
  const match = content.match(/\*\*(.+?)\*\*/);
  return match ? match[1].trim() : null;
}
