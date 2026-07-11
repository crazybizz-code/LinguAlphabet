import Parser from "rss-parser";
import type { ContentProvider, RawContentItem } from "../types";

const parser = new Parser();

/**
 * A generic RSS 2.0 <item> as rss-parser exposes it, widened with an index
 * signature — fields like "content:encoded" and "description" aren't in
 * rss-parser's typed Item interface but do appear on real feed items, and
 * accessing them here (rather than assuming a specific feed's quirks) is
 * what makes this provider correct against any RSS 2.0 source, not just
 * Breaking News English.
 */
type FeedItem = Parser.Item & Record<string, unknown>;

function stringField(item: FeedItem, key: string): string | undefined {
  const value = item[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Pure mapping, no network — unit-testable with a hardcoded item even without live feed access. */
export function mapFeedItemToRaw(item: FeedItem): RawContentItem {
  const externalId = item.guid ?? item.link;
  if (!externalId) {
    throw new Error("RSS provider: item has neither guid nor link to use as an external id");
  }

  const body =
    stringField(item, "content:encoded") ??
    stringField(item, "content") ??
    stringField(item, "contentSnippet") ??
    stringField(item, "description") ??
    "";

  return {
    externalId,
    title: item.title ?? "Untitled",
    body,
    url: item.link,
    publishedAt: item.isoDate ?? item.pubDate,
    raw: item,
  };
}

/**
 * 1. Content Provider — the first real one. One implementation serves
 * arbitrarily many RSS feeds (each a separate `content_sources` row with
 * its own `config.feedUrl`), so a second feed later is a data row, never a
 * new provider (docs/content-engine.md, requirement "support multiple RSS
 * sources without code duplication").
 */
export const rssArticleProvider: ContentProvider = {
  id: "rss",
  contentType: "article",
  async fetchRawItems(sourceConfig: Record<string, unknown>): Promise<RawContentItem[]> {
    const feedUrl = sourceConfig.feedUrl;
    if (typeof feedUrl !== "string" || !feedUrl) {
      throw new Error("RSS provider: sourceConfig.feedUrl is required");
    }

    const feed = await parser.parseURL(feedUrl);
    return (feed.items as FeedItem[]).map(mapFeedItemToRaw);
  },
};
