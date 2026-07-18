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

/** 10 hand-authored, locally-hosted placeholder images (public/assets/placeholders) —
 * local files, not a remote host, so there's nothing to 404 mid-demo. */
interface PlaceholderTheme {
  category: string;
  /** Matched case-insensitively as a substring against the item's topics/tags. */
  keywords: string[];
  src: string;
}

const PLACEHOLDER_THEMES: readonly PlaceholderTheme[] = [
  { category: "Technology", keywords: ["technology", "tech", "gaming", "ai", "software"], src: "/assets/placeholders/technology.svg" },
  { category: "Business", keywords: ["business", "finance", "economy", "economic", "work", "job"], src: "/assets/placeholders/business.svg" },
  { category: "Science", keywords: ["science", "research", "space", "physics", "biology"], src: "/assets/placeholders/science.svg" },
  { category: "Health", keywords: ["health", "medicine", "medical", "wellness"], src: "/assets/placeholders/health.svg" },
  { category: "Education", keywords: ["education", "school", "books", "learning", "university"], src: "/assets/placeholders/education.svg" },
  { category: "Politics", keywords: ["politics", "political", "government", "congress", "election", "policy"], src: "/assets/placeholders/politics.svg" },
  { category: "Environment", keywords: ["environment", "climate", "nature", "wildlife"], src: "/assets/placeholders/environment.svg" },
  { category: "Culture", keywords: ["culture", "movies", "music", "art", "books"], src: "/assets/placeholders/culture.svg" },
  { category: "Travel", keywords: ["travel", "tourism"], src: "/assets/placeholders/travel.svg" },
  { category: "Sports", keywords: ["sports", "food"], src: "/assets/placeholders/sports.svg" },
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
