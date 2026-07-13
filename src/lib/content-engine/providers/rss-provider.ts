import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ContentProvider, RawContentItem } from "../types";

const parser = new Parser();

const ARTICLE_FETCH_TIMEOUT_MS = 10_000;
/** Below this many characters of extracted plain text, treat Readability's
 * result as a failed extraction (e.g. it latched onto a nav/sidebar
 * fragment) rather than a genuine article body. */
const MIN_EXTRACTED_TEXT_LENGTH = 200;

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

/**
 * What the RSS feed itself provides — often only an excerpt/summary, not
 * the full article (confirmed in production: Breaking News English's feed
 * body came through this short). Used only as a fallback now, when the
 * full-article fetch below fails.
 */
function extractBodyFromRssFields(item: FeedItem): string {
  return (
    stringField(item, "content:encoded") ??
    stringField(item, "content") ??
    stringField(item, "contentSnippet") ??
    stringField(item, "description") ??
    ""
  );
}

/**
 * Second stage: fetches the article's own page and runs Mozilla's
 * Readability algorithm (the same engine behind Firefox Reader View) over
 * it to extract just the main content, stripped of navigation, ads, and
 * other boilerplate — jsdom builds the DOM Readability needs to operate on
 * (scripts are never executed; jsdom only runs them with the opt-in
 * `runScripts: "dangerously"`, which this doesn't set). Returns null on
 * any failure — a slow/unreachable page, a paywall, a layout Readability
 * can't parse, or suspiciously short extracted text — so the caller can
 * fall back to the RSS-provided text rather than the whole item failing.
 */
async function fetchFullArticleBody(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "LinguABCBot/1.0 (content ingestion for an English-learning app)" },
    });
    if (!response.ok) return null;

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article?.content) return null;
    if ((article.textContent ?? "").trim().length < MIN_EXTRACTED_TEXT_LENGTH) return null;

    return article.content;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Prefers the full article body (fetched + extracted above) over whatever
 * the RSS feed itself provided, per docs/content-engine.md — the RSS text
 * is a fallback for when the article page can't be fetched or parsed, not
 * the primary source.
 */
export async function mapFeedItemToRaw(item: FeedItem): Promise<RawContentItem> {
  const externalId = item.guid ?? item.link;
  if (!externalId) {
    throw new Error("RSS provider: item has neither guid nor link to use as an external id");
  }

  const rssBody = extractBodyFromRssFields(item);
  const fullBody = item.link ? await fetchFullArticleBody(item.link) : null;

  return {
    externalId,
    title: item.title ?? "Untitled",
    body: fullBody ?? rssBody,
    url: item.link,
    publishedAt: item.isoDate ?? item.pubDate,
    // rss-parser normalizes RSS's <dc:creator> to `.creator`; Atom's
    // <author><name> lands on `.creator` too, but some feeds only expose
    // a raw `author` string field — checked as a fallback.
    author: item.creator ?? stringField(item, "author"),
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
    // Sequential, not Promise.all — each item now triggers a real fetch
    // against the source site, and hammering it with N concurrent
    // requests would be an impolite way to treat someone else's server.
    const items: RawContentItem[] = [];
    for (const item of feed.items as FeedItem[]) {
      items.push(await mapFeedItemToRaw(item));
    }
    return items;
  },
};
