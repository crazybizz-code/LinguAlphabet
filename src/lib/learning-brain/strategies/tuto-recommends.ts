import type { ContentItem } from "@/types/content";

/**
 * Layer 3: the next several Layer-2-ranked items, excluding whatever is
 * already Today's Mission (docs/domain-model.md "Context-specific
 * selection"). Content-type agnostic — picks from whatever catalog it's
 * given.
 */
export const tutoRecommendsStrategy = {
  pick<T extends ContentItem>(ranked: T[], excludeContentId: string | undefined, count = 3): T[] {
    return ranked.filter((item) => item.id !== excludeContentId).slice(0, count);
  },
};
