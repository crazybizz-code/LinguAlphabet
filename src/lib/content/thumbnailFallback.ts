// TEMP DEMO FALLBACK
// Remove after thumbnail extraction is fixed.
//
// The Content Engine's thumbnail extraction (src/lib/content-engine) is
// currently producing null/empty thumbnail_url for some new articles —
// see the [thumbnail-trace] instrumentation in
// src/lib/content-engine/providers/the-conversation-provider.ts and
// src/lib/content-engine/storage.ts for the active investigation. This
// module does NOT touch that pipeline or its extraction logic at all — it
// only decides what the UI shows when a content item's real thumbnail is
// missing, so users never see a gray placeholder or a broken image while
// that's being root-caused.
//
// This is a strict 3-tier priority, and it can never return a falsy value:
//   1. The real thumbnail_url from the database (handled by the caller,
//      queries.ts — this module is only ever reached when that's missing).
//   2. A category-matched local editorial photo.
//   3. A single generic default photo (students.webp) when no category
//      matches at all.
// The same content item always resolves to the same image, in every
// session, on every render — this is pure keyword matching over the
// item's own topics/tags, nothing random or time-based.

/** 11 real editorial photos served locally from public/images/article-fallbacks/
 * — not illustrations, not a remote host (nothing to 404, works fully
 * offline). 10 are category-specific; students.webp is the tier-3 default. */
interface PlaceholderTheme {
  category: string;
  /** Matched case-insensitively as a substring against the item's topics/tags. */
  keywords: string[];
  src: string;
}

const PLACEHOLDER_THEMES: readonly PlaceholderTheme[] = [
  { category: "Technology", keywords: ["technology", "tech", "gaming", "ai", "software"], src: "/images/article-fallbacks/technology.webp" },
  { category: "Business", keywords: ["business", "finance", "economy", "economic", "work", "job"], src: "/images/article-fallbacks/business.webp" },
  { category: "Science", keywords: ["science", "research", "space", "physics", "biology"], src: "/images/article-fallbacks/science.webp" },
  { category: "Health", keywords: ["health", "medicine", "medical", "wellness"], src: "/images/article-fallbacks/health.webp" },
  { category: "Education", keywords: ["education", "school", "books", "learning", "university"], src: "/images/article-fallbacks/education.webp" },
  { category: "Politics", keywords: ["politics", "political", "government", "congress", "election", "policy"], src: "/images/article-fallbacks/politics.webp" },
  { category: "Environment", keywords: ["environment", "climate", "nature", "wildlife"], src: "/images/article-fallbacks/environment.webp" },
  { category: "Culture", keywords: ["culture", "movies", "music", "art"], src: "/images/article-fallbacks/culture.webp" },
  { category: "Travel", keywords: ["travel", "tourism"], src: "/images/article-fallbacks/travel.webp" },
  { category: "Sports", keywords: ["sports", "food"], src: "/images/article-fallbacks/sports.webp" },
];

/** Tier 3 — used whenever no category keyword matches at all. */
const DEFAULT_FALLBACK_SRC = "/images/article-fallbacks/students.webp";

function findThemeByKeyword(topicsAndTags: string[]): PlaceholderTheme | null {
  const haystack = topicsAndTags.map((value) => value.toLowerCase());
  return PLACEHOLDER_THEMES.find((theme) => theme.keywords.some((keyword) => haystack.some((value) => value.includes(keyword)))) ?? null;
}

/**
 * Resolves the fallback image for a content item whose real thumbnail_url
 * is missing (tier 1, handled by the caller). Tier 2: a theme matching the
 * item's actual topics/tags. Tier 3: the generic default — never null,
 * never empty.
 */
export function resolveThumbnailFallback(params: { topics?: readonly string[]; tags?: readonly string[] }): string {
  const combined = [...(params.topics ?? []), ...(params.tags ?? [])];
  const themeMatch = findThemeByKeyword(combined);
  return themeMatch?.src ?? DEFAULT_FALLBACK_SRC;
}
