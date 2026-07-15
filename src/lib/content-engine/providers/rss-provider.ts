import Parser from "rss-parser";
import type { ContentProvider, RawContentItem } from "../types";

const parser = new Parser();

/**
 * Deliberately minimal, by explicit instruction: this provider supports
 * exactly one source (TechCrunch, docs/content-source-policy.md), chosen
 * specifically because its RSS feed already carries the complete article
 * in `content:encoded` (rss-parser normalizes that onto `.content`). There
 * is no second HTTP fetch, no Readability, no HTML scraping, and no
 * excerpt fallback — if a feed doesn't actually contain the full body,
 * this provider is not the fix; the fix is choosing a different, verified
 * source, not adding fallback logic back into this one.
 */
export function mapFeedItemToRaw(item: Parser.Item): RawContentItem {
  const externalId = item.guid ?? item.link;
  if (!externalId) {
    throw new Error("RSS provider: item has neither guid nor link to use as an external id");
  }

  return {
    externalId,
    title: item.title ?? "Untitled",
    body: item.content ?? "",
    url: item.link,
    publishedAt: item.isoDate ?? item.pubDate,
    author: item.creator,
    raw: item,
  };
}

export const rssArticleProvider: ContentProvider = {
  id: "rss",
  contentType: "article",
  async fetchRawItems(sourceConfig: Record<string, unknown>): Promise<RawContentItem[]> {
    const feedUrl = sourceConfig.feedUrl;
    if (typeof feedUrl !== "string" || !feedUrl) {
      throw new Error("RSS provider: sourceConfig.feedUrl is required");
    }

    const feed = await parser.parseURL(feedUrl);
    return feed.items.map(mapFeedItemToRaw);
  },
};
