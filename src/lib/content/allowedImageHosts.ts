/**
 * Runtime guard for remote thumbnails, and the source of next.config.ts's
 * `images.remotePatterns`.
 *
 * HISTORY, because this file has now caused the same class of bug twice:
 * it began as a hand-maintained list of hostnames. next/image THROWS for
 * any host missing from remotePatterns, which crashed whole pages when
 * the active content source changed without this list being updated. The
 * fix at the time was a runtime host check so an unlisted host degraded
 * to the branded cover instead of crashing.
 *
 * That fixed the crash but created a quieter failure: with a
 * hand-maintained allowlist, EVERY newly added content source shows the
 * branded fallback for all of its articles — real, working photos
 * included — until a human remembers to add its image host here. Enabling
 * multiple RSS sources (whose CDN hostnames are not knowable in advance,
 * and change without notice) makes that failure the normal case rather
 * than the exception.
 *
 * So the allowlist is no longer a host list. Two things replace it:
 *
 *   1. INGESTION-TIME VALIDATION (content-engine/thumbnails.ts) — a
 *      thumbnail_url only reaches the database if a HEAD request proved
 *      it serves a real image. Garbage never gets stored, so the render
 *      layer doesn't have to defend against it.
 *   2. THIS CHECK — a cheap structural guard (https, parseable, not a
 *      known tracking pixel) plus the cards' existing onError fallback,
 *      which together cover anything that rots between ingestion and
 *      render.
 *
 * next.config.ts pairs this with a wildcard https remotePattern, so
 * next/image can no longer throw for an unrecognised host. TRADEOFF: that
 * makes /_next/image able to optimize any https image, i.e. usable as an
 * open image-resizing proxy by anyone who can call it. Accepted
 * deliberately for launch — the alternative is silently hiding real
 * photos from every source we add — and it should be narrowed to the
 * observed CDN hosts once the production source set has stabilised and
 * those hosts are actually known.
 */

/** Same tracking-pixel shapes content-engine/thumbnails.ts rejects at extraction time — repeated here because pre-existing rows were stored before that validation existed. */
const NON_CONTENT_PATTERNS: readonly RegExp[] = [
  /counter\./i,
  /\/pixel\b/i,
  /\btracking\b/i,
  /\bbeacon\b/i,
  /\b1x1\b/i,
  /\bdoubleclick\b/i,
  /\bgoogle-analytics\b/i,
];

/**
 * Whether this URL is structurally safe to hand to next/image. Not a
 * host allowlist any more (see the file comment) — it answers "could
 * this render at all", and the card's onError handles "did it".
 */
export function isAllowedImageHost(url: string): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // next.config.ts only permits https remote patterns; an http URL would
  // fail to render rather than merely look insecure.
  if (parsed.protocol !== "https:") return false;
  return !NON_CONTENT_PATTERNS.some((pattern) => pattern.test(url));
}
