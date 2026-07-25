/**
 * Production bug fix (thumbnail_url domain mismatch): the single source of
 * truth for every remote hostname next/image is allowed to optimize.
 * Previously this list existed ONLY in next.config.ts, with no runtime
 * check anywhere else — so when the active content source changed
 * (TechCrunch replacing The Conversation as the sole active source, see
 * docs/content-source-policy.md) without this list being updated,
 * next/image threw a render exception for every real thumbnailUrl
 * ("Invalid src prop ... hostname is not configured"), crashing the whole
 * page. ArticleCard/PodcastCard now check a URL's hostname against this
 * exact list BEFORE ever handing it to <Image>, so an unlisted host
 * degrades straight to the local themed fallback instead of crashing —
 * regardless of which content source is active or how next.config.ts
 * drifts from it in the future.
 */
export const ALLOWED_IMAGE_HOSTS: readonly string[] = [
  "images.unsplash.com",
  // "**." prefix mirrors Next.js's own remotePatterns glob: matches the
  // bare domain and any subdomain depth, not just one level.
  "**.theconversation.com",
  "techcrunch.com",
];

/** Mirrors Next.js's own remotePatterns hostname glob semantics for this exact, small, known list. */
export function isAllowedImageHost(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return ALLOWED_IMAGE_HOSTS.some((pattern) => {
    if (pattern.startsWith("**.")) {
      const base = pattern.slice(3);
      return hostname === base || hostname.endsWith(`.${base}`);
    }
    return hostname === pattern;
  });
}
