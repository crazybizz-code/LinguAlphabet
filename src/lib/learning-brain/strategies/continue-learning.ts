import type { ContentItem } from "@/types/content";
import type { Database } from "@/types/supabase";

type ProgressRow = Database["public"]["Tables"]["progress"]["Row"];

export interface ResumeCandidate<T extends ContentItem> {
  content: T;
  positionSeconds: number;
}

/**
 * Layer 3 (docs/domain-model.md "Context-specific selection"): Continue
 * Learning is deliberately NOT a score — it's a direct Resume Progress
 * (§16) query. The most recently touched unfinished item always wins.
 * Content-type agnostic: works over any ContentItem catalog.
 */
export const continueLearningStrategy = {
  find<T extends ContentItem>(progressRows: ProgressRow[], catalog: T[]): ResumeCandidate<T> | null {
    const byId = new Map(catalog.map((item) => [item.id, item]));
    const mostRecent = [...progressRows]
      .filter((row) => !row.completed)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];

    if (!mostRecent) return null;
    const content = byId.get(mostRecent.content_item_id);
    if (!content) return null;

    return { content, positionSeconds: mostRecent.position_seconds };
  },
};
