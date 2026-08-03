import Parser from "rss-parser";
import type { ContentProvider, RawContentItem } from "../types";
import { extractThumbnailFromFeedItem, extractThumbnailFromHtml } from "../thumbnails";

/**
 * Generic RSS/Atom provider — the one `provider_id = 'rss'` every
 * multi-source content_sources row points at.
 *
 * This provider previously existed, was deleted during the
 * single-source reset (supabase/content-engine-reset-single-source.sql),
 * and was never restored — while ~15 content_sources rows kept
 * provider_id='rss'. Any one of those rows flipped to enabled=true failed
 * the whole source with "provider 'rss' not registered". Restoring it is
 * what makes multi-source possible again.
 *
 * DELIBERATELY NO PAGE FETCH AND NO READABILITY. That combination is
 * exactly what the reset migration tore out: a second HTTP request per
 * article against the publisher's own page, whose extraction was never
 * confirmed working in production. This provider only ever reads what the
 * feed itself returns, so its failure mode is "this feed carries short
 * bodies" (caught by the quality gate / body-length filter) rather than
 * "an extractor silently produced garbage".
 *
 * A feed whose entries carry only a truncated teaser is therefore not
 * usable as a full-text source. `minBodyLength` (per-source config)
 * enforces that at the boundary instead of letting stub articles reach
 * learners — the failure the original TechCrunch source shipped with.
 */

/** Feeds vary wildly; anything shorter than this is a teaser, not an article. Overridable per source via config. */
const DEFAULT_MIN_BODY_LENGTH = 600;
const DEFAULT_FEED_SCAN_WINDOW = 10;

/**
 * rss-parser exposes non-standard fields only when they're declared up
 * front. content:encoded carries the full body on most WordPress-family
 * feeds; the media:* fields feed thumbnail extraction.
 */
const FEED_PARSER = new Parser({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:content", "media:content", { keepArray: false }],
      ["media:thumbnail", "media:thumbnail", { keepArray: false }],
    ],
  },
});

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Longest available body wins. Feeds are inconsistent about which field
 * holds the real text — content:encoded usually does when present, but
 * some feeds put the full article in <content> or even <description> and
 * a teaser in the other. Picking by length rather than by a fixed field
 * order avoids silently ingesting the teaser when the full text was
 * sitting in a different element.
 */
export function pickLongestBody(item: Record<string, unknown>): string {
  const candidates = [item.contentEncoded, item.content, item.summary, item.contentSnippet, item.description]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(stripHtml);

  return candidates.reduce((longest, current) => (current.length > longest.length ? current : longest), "");
}

/** The raw markup of whichever fields might carry an <img>, for thumbnail extraction (which needs the tags stripHtml removes). */
function collectItemHtml(item: Record<string, unknown>): string {
  return [item.contentEncoded, item.content, item.summary, item.description]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

export const rssProvider: ContentProvider = {
  id: "rss",
  contentType: "article",
  async fetchRawItems(sourceConfig: Record<string, unknown>): Promise<RawContentItem[]> {
    const feedUrl = typeof sourceConfig.feedUrl === "string" ? sourceConfig.feedUrl.trim() : "";
    // A placeholder is a configuration error, not a transient failure —
    // several seeded rows still carry the literal "<FEED_URL>" sentinel
    // from supabase/content-source-legal-migration.sql, and silently
    // fetching that would surface as a confusing DNS error instead.
    if (!feedUrl || feedUrl.startsWith("<")) {
      throw new Error(`RSS provider: source has no real feedUrl configured (got ${JSON.stringify(sourceConfig.feedUrl ?? null)})`);
    }

    const feedScanWindow =
      typeof sourceConfig.feedScanWindow === "number" && sourceConfig.feedScanWindow > 0
        ? sourceConfig.feedScanWindow
        : DEFAULT_FEED_SCAN_WINDOW;
    const minBodyLength =
      typeof sourceConfig.minBodyLength === "number" && sourceConfig.minBodyLength >= 0
        ? sourceConfig.minBodyLength
        : DEFAULT_MIN_BODY_LENGTH;

    const feed = await FEED_PARSER.parseURL(feedUrl);

    const items: RawContentItem[] = [];
    for (const rawItem of feed.items.slice(0, feedScanWindow)) {
      const item = rawItem as unknown as Record<string, unknown>;
      const link = typeof item.link === "string" ? item.link : undefined;
      const externalId = (typeof item.guid === "string" ? item.guid : undefined) ?? link;
      if (!externalId) continue;

      const body = pickLongestBody(item);
      // Dropped here rather than passed downstream: a teaser would burn a
      // Gemini enrichment call and then fail the quality gate anyway.
      if (body.length < minBodyLength) continue;

      const itemHtml = collectItemHtml(item);
      const thumbnailUrl = extractThumbnailFromFeedItem(item) ?? extractThumbnailFromHtml(itemHtml, link);

      // The feed's own short summary, kept separate from `body`.
      // contentSnippet is rss-parser's pre-stripped text form of the
      // item's summary; description is the raw element. Either is a
      // better card description than a mechanical cut of the full body.
      const feedSummary =
        (typeof item.contentSnippet === "string" ? item.contentSnippet : undefined) ??
        (typeof item.summary === "string" ? item.summary : undefined) ??
        (typeof item.description === "string" ? item.description : undefined);

      items.push({
        externalId,
        title: typeof item.title === "string" ? item.title : "Untitled",
        body,
        description: feedSummary ? stripHtml(feedSummary) : undefined,
        url: link,
        publishedAt: (typeof item.isoDate === "string" ? item.isoDate : undefined) ?? (typeof item.pubDate === "string" ? item.pubDate : undefined),
        thumbnailUrl,
        author: (typeof item.creator === "string" ? item.creator : undefined) ?? (typeof item.author === "string" ? item.author : undefined),
        raw: { feedItem: item, feedTitle: feed.title, originalUrl: link },
      });
    }

    return items;
  },
};
