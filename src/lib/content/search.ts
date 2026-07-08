import type { ContentItem } from "@/types/content";

/**
 * Universal Search (docs/dashboard-architecture.md §9): matches
 * title/description/topics — the same three fields every content type
 * shares — so this works unmodified once Articles/Videos/etc. exist;
 * nothing here is podcast-specific. In-memory over an already-fetched
 * catalog while it's small (13 items today); moves to a DB-backed query
 * (Postgres ilike/tsvector across content_items) once volume warrants
 * it — not a launch requirement.
 */
export function searchContent<T extends ContentItem>(catalog: T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return catalog;

  return catalog.filter((item) => {
    const haystack = [item.title, item.description, ...item.topics].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}
