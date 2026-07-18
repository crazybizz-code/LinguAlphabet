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
// missing, so demo screens never show a broken image or an empty card
// while that's being root-caused.
//
// One rule: the same content item always gets the same placeholder, in
// every session, on every render — never a random image on reload. That
// comes from hashing the item's own id (stable for the item's whole
// life), not Math.random() or anything time-based.

/**
 * 10 real editorial photos, one per category, served locally from
 * public/images/article-fallbacks/ — not hand-drawn illustrations, not a
 * remote host (nothing to 404 mid-demo, works fully offline). These are
 * NOT checked into this commit: drop a royalty-free (Unsplash/Pexels)
 * landscape JPG at each path below, named exactly as listed, before the
 * demo. Until a file exists at a given path, that one category's image
 * 404s — every OTHER category is unaffected, and this is the one line
 * to change if the file layout ever moves.
 */
interface PlaceholderTheme {
  category: string;
  /** Matched case-insensitively as a substring against the item's topics/tags. */
  keywords: string[];
  src: string;
}

const PLACEHOLDER_THEMES: readonly PlaceholderTheme[] = [
  { category: "Technology", keywords: ["technology", "tech", "gaming", "ai", "software"], src: "/images/article-fallbacks/technology.jpg" },
  { category: "Business", keywords: ["business", "finance", "economy", "economic", "work", "job"], src: "/images/article-fallbacks/business.jpg" },
  { category: "Science", keywords: ["science", "research", "space", "physics", "biology"], src: "/images/article-fallbacks/science.jpg" },
  { category: "Health", keywords: ["health", "medicine", "medical", "wellness"], src: "/images/article-fallbacks/health.jpg" },
  { category: "Education", keywords: ["education", "school", "books", "learning", "university"], src: "/images/article-fallbacks/education.jpg" },
  { category: "Politics", keywords: ["politics", "political", "government", "congress", "election", "policy"], src: "/images/article-fallbacks/politics.jpg" },
  { category: "Environment", keywords: ["environment", "climate", "nature", "wildlife"], src: "/images/article-fallbacks/environment.jpg" },
  { category: "Culture", keywords: ["culture", "movies", "music", "art", "books"], src: "/images/article-fallbacks/culture.jpg" },
  { category: "Travel", keywords: ["travel", "tourism"], src: "/images/article-fallbacks/travel.jpg" },
  { category: "Sports", keywords: ["sports", "food"], src: "/images/article-fallbacks/sports.jpg" },
];

/** djb2 — a small, dependency-free string hash. Deterministic and stable across processes/sessions (unlike Math.random or Date-based selection). */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0; // unsigned
}

function findThemeByKeyword(topicsAndTags: string[]): PlaceholderTheme | null {
  const haystack = topicsAndTags.map((value) => value.toLowerCase());
  return PLACEHOLDER_THEMES.find((theme) => theme.keywords.some((keyword) => haystack.some((value) => value.includes(keyword)))) ?? null;
}

/**
 * Resolves the fallback image for a content item whose real thumbnail_url
 * is missing. Prefers a theme matching the item's actual topics/tags; if
 * none matches (or none were supplied), falls back to a pure hash-of-id
 * selection across all 10 placeholders — still fully deterministic, just
 * not theme-aware.
 */
export function resolveThumbnailFallback(params: { id: string; topics?: readonly string[]; tags?: readonly string[] }): string {
  const combined = [...(params.topics ?? []), ...(params.tags ?? [])];
  const themeMatch = findThemeByKeyword(combined);
  if (themeMatch) return themeMatch.src;

  const index = hashString(params.id) % PLACEHOLDER_THEMES.length;
  return PLACEHOLDER_THEMES[index].src;
}
