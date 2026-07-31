import * as cheerio from "cheerio";

/**
 * Shared thumbnail extraction + validation for every content provider.
 *
 * Why this exists: The Conversation provider grew a good layered
 * extractor (og:image-ish -> feed markup -> first content image) while
 * PLOS shipped with NO thumbnail extraction at all, so every PLOS article
 * fell back to the branded cover. That wasn't a rendering bug — the
 * render side already degrades correctly — it was a *sourcing* gap. One
 * shared extractor means a new provider gets working thumbnails by
 * default instead of having to reinvent this.
 *
 * The Conversation's own provider deliberately keeps its stricter,
 * host-pinned extractor (only images.theconversation.com counts, so a CC
 * logo or tracking pixel can never be mistaken for an article photo).
 * That is a compliance requirement specific to that source, so it is NOT
 * replaced by this general-purpose version.
 */

/** Ordered by how strongly each signal indicates "this is THE image for this document". */
const META_SELECTORS: readonly string[] = [
  'meta[property="og:image:secure_url"]',
  'meta[property="og:image"]',
  'meta[name="og:image"]',
  'meta[property="twitter:image"]',
  'meta[name="twitter:image"]',
  'meta[name="twitter:image:src"]',
  'link[rel="image_src"]',
];

/**
 * Hosts and filename shapes that are never article photography. Tracking
 * pixels are the dangerous case: they're real, fetchable, 200-OK images,
 * so no amount of HTTP validation can distinguish them — only pattern
 * matching at extraction time can.
 */
const NON_CONTENT_PATTERNS: readonly RegExp[] = [
  /counter\./i,
  /\/pixel\b/i,
  /\btracking\b/i,
  /\bbeacon\b/i,
  /\bspacer\b/i,
  /\b1x1\b/i,
  /\bblank\.(gif|png)\b/i,
  /\bdoubleclick\b/i,
  /\bgoogle-analytics\b/i,
];

/**
 * Site furniture: licence badges, logos, avatars, icons. Real, reachable,
 * correctly-typed images that are not photographs of anything, so no
 * amount of HTTP validation can distinguish them — only the URL can.
 *
 * Added after a Creative Commons badge
 * (cdn.theconversation.com/static/tc/creative-commons-logo-*.png) was
 * found stored as the thumbnail for 17 different articles. One image
 * shared across many articles is the signature of this class.
 *
 * Word boundaries are load-bearing: a bare /icon/ substring would reject
 * a legitimate photo named "iconic-building.jpg", while `\bicon\b` does
 * not match "iconic". Rejecting a real photo by mistake only degrades to
 * the branded cover, but the fewer false positives the better.
 */
const STATIC_ASSET_PATTERNS: readonly RegExp[] = [
  /\bcreative[-_]?commons\b/i,
  /\/static\//i,
  /\blogos?\b/i,
  /\bavatars?\b/i,
  /\bicons?\b/i,
  /\bfavicons?\b/i,
  /\bbadges?\b/i,
  /\bsprites?\b/i,
  /\bplaceholders?\b/i,
  /\bwatermarks?\b/i,
];

/**
 * Whether a URL points at site furniture rather than content imagery.
 * Exported so providers with their own extractors (The Conversation's
 * host-pinned one) can apply the same rule without duplicating it.
 */
export function isStaticAssetUrl(url: string): boolean {
  return STATIC_ASSET_PATTERNS.some((pattern) => pattern.test(url));
}

function isPlausibleContentImage(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  if (isStaticAssetUrl(url)) return false;
  return !NON_CONTENT_PATTERNS.some((pattern) => pattern.test(url));
}

/** Resolves protocol-relative and root-relative URLs so a feed's relative <img src> isn't silently dropped. */
function absolutize(candidate: string, baseUrl?: string): string | undefined {
  const value = candidate.trim();
  if (!value || value.startsWith("data:")) return undefined;
  if (value.startsWith("https://")) return value;
  // http:// is upgraded rather than accepted: next/image is configured for
  // https only, so an http URL would render as a broken image.
  if (value.startsWith("http://")) return `https://${value.slice(7)}`;
  // `value` still carries its leading "//", so the scheme is all that's missing.
  if (value.startsWith("//")) return `https:${value}`;
  if (!baseUrl) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

/** An explicit 1x1 (or smaller-than-a-thumbnail) declared size marks a tracking pixel even when its URL looks innocent. */
function hasTrackingDimensions($el: cheerio.Cheerio<never>): boolean {
  const width = Number($el.attr("width"));
  const height = Number($el.attr("height"));
  if (Number.isFinite(width) && width > 0 && width <= 2) return true;
  if (Number.isFinite(height) && height > 0 && height <= 2) return true;
  return false;
}

/**
 * Best thumbnail candidate from an HTML (or XML-ish feed content)
 * fragment, in descending order of confidence:
 *   1. Explicit social/meta image declarations — the publisher's own
 *      statement of "this is the image for this document".
 *   2. Feed-specific media elements (<media:thumbnail>, <media:content>,
 *      <enclosure type="image/*">, <itunes:image>).
 *   3. The first plausible in-body <img>.
 *
 * Pure and synchronous — no network — so it's fully unit-testable and
 * can't slow a run down. Reachability is a separate concern
 * (isFetchableImage below).
 */
export function extractThumbnailFromHtml(html: string, baseUrl?: string): string | undefined {
  if (!html || !html.trim()) return undefined;

  // xmlMode: false so both real HTML and feed content fragments parse;
  // cheerio tolerates the namespaced feed elements either way.
  const $ = cheerio.load(html);

  for (const selector of META_SELECTORS) {
    const raw = $(selector).first().attr("content") ?? $(selector).first().attr("href");
    const resolved = raw ? absolutize(raw, baseUrl) : undefined;
    if (resolved && isPlausibleContentImage(resolved)) return resolved;
  }

  for (const selector of ["media\\:thumbnail", "media\\:content", "itunes\\:image", "thumbnail"]) {
    const el = $(selector).first();
    const raw = el.attr("url") ?? el.attr("href");
    const type = el.attr("type") ?? "";
    if (type && !type.startsWith("image/")) continue;
    const resolved = raw ? absolutize(raw, baseUrl) : undefined;
    if (resolved && isPlausibleContentImage(resolved)) return resolved;
  }

  const enclosure = $('enclosure[type^="image/"]').first().attr("url");
  const enclosureResolved = enclosure ? absolutize(enclosure, baseUrl) : undefined;
  if (enclosureResolved && isPlausibleContentImage(enclosureResolved)) return enclosureResolved;

  for (const img of $("img").toArray()) {
    const el = $(img) as unknown as cheerio.Cheerio<never>;
    if (hasTrackingDimensions(el)) continue;
    const raw =
      $(img).attr("src")?.trim() ||
      $(img).attr("data-src")?.trim() ||
      $(img).attr("data-lazy-src")?.trim() ||
      $(img).attr("srcset")?.trim().split(/[\s,]/)[0] ||
      "";
    const resolved = absolutize(raw, baseUrl);
    if (resolved && isPlausibleContentImage(resolved)) return resolved;
  }

  return undefined;
}

/**
 * rss-parser hands feed media back as parsed fields rather than raw XML,
 * so those have to be read off the item object as well as out of its
 * HTML content. Shape is deliberately loose — every feed dialect names
 * these differently and rss-parser passes unknown fields through as-is.
 */
export function extractThumbnailFromFeedItem(item: Record<string, unknown>): string | undefined {
  const candidates: Array<string | undefined> = [];

  const enclosure = item.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url && (!enclosure.type || enclosure.type.startsWith("image/"))) {
    candidates.push(enclosure.url);
  }

  for (const key of ["media:thumbnail", "media:content", "itunes:image"]) {
    const value = item[key] as { url?: string; $?: { url?: string; href?: string } } | undefined;
    candidates.push(value?.url ?? value?.$?.url ?? value?.$?.href);
  }

  const image = item.image as { url?: string } | string | undefined;
  candidates.push(typeof image === "string" ? image : image?.url);

  for (const candidate of candidates) {
    const resolved = candidate ? absolutize(candidate) : undefined;
    if (resolved && isPlausibleContentImage(resolved)) return resolved;
  }
  return undefined;
}

/**
 * Confirms a candidate URL actually serves an image, with a HEAD request.
 *
 * This is what turns "we extracted something that looks like a URL" into
 * "this will render". Running it at INGESTION time rather than at render
 * time is the important part: a thumbnail_url only ever reaches the
 * database if it was reachable and image-typed, so the UI's fallback
 * fires for genuinely image-less content instead of for broken links.
 *
 * Fails closed — any network error, timeout, non-2xx, or non-image
 * content-type returns false, because an unverifiable thumbnail and a
 * bad one are the same thing to a learner looking at the card.
 */
export async function isFetchableImage(url: string, timeoutMs = 5000): Promise<boolean> {
  if (!isPlausibleContentImage(url)) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    if (!response.ok) return false;
    const contentType = response.headers.get("content-type") ?? "";
    return contentType.toLowerCase().startsWith("image/");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extraction + verification in one step, for providers that already hold
 * the relevant HTML. Returns undefined (never a broken URL) when nothing
 * verifiable was found, which the pipeline stores as an empty
 * thumbnail_url and the cards render as the branded cover.
 */
export async function resolveThumbnail(html: string, baseUrl?: string): Promise<string | undefined> {
  const candidate = extractThumbnailFromHtml(html, baseUrl);
  if (!candidate) return undefined;
  return (await isFetchableImage(candidate)) ? candidate : undefined;
}
