import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ContentProvider, RawContentItem } from "../types";

// media:content/media:thumbnail are Media RSS extension elements —
// rss-parser silently drops any XML element it doesn't recognize unless
// explicitly told to keep it via customFields (confirmed directly
// against the installed rss-parser: without this, these two elements
// never even reach the parsed item as raw properties). `enclosure` needs
// no such config — it's a first-class RSS 2.0 field rss-parser already
// exposes as a typed `Item.enclosure`.
const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
    ],
  },
});

const ARTICLE_FETCH_TIMEOUT_MS = 10_000;
/** Below this many characters of extracted plain text, treat Readability's
 * result as a failed extraction (e.g. it latched onto a nav/sidebar
 * fragment) rather than a genuine article body. */
const MIN_EXTRACTED_TEXT_LENGTH = 200;
/** A single network hiccup/timeout fetching the article page shouldn't
 * permanently lock the article into the (usually much shorter) RSS-feed
 * excerpt — a published item is never re-attempted on a later run (see
 * pipeline.ts's processed_at dedup), so this is the only chance. */
const ARTICLE_FETCH_MAX_ATTEMPTS = 2;
const ARTICLE_FETCH_RETRY_DELAY_MS = 500;

/**
 * A generic RSS 2.0 <item> as rss-parser exposes it, widened with an index
 * signature — fields like "content:encoded" and "description" aren't in
 * rss-parser's typed Item interface but do appear on real feed items, and
 * accessing them here (rather than assuming a specific feed's quirks) is
 * what makes this provider correct against any RSS 2.0 source, not just
 * Breaking News English.
 */
type FeedItem = Parser.Item & {
  mediaContent?: Array<{ $?: { url?: string; medium?: string } }>;
  mediaThumbnail?: Array<{ $?: { url?: string } }>;
} & Record<string, unknown>;

function stringField(item: FeedItem, key: string): string | undefined {
  const value = item[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * Preview image, checked in the priority order the product spec asks
 * for: media:content, then media:thumbnail (both Media RSS — common on
 * government/news feeds), then a same-purpose RSS 2.0 `<enclosure>`
 * (restricted to an actual image MIME type — a podcast/PDF enclosure on
 * the same field would otherwise be mistaken for a picture). og:image
 * isn't checked here — it only exists on the article's own page, so it's
 * extracted in `fetchArticlePage` below, alongside the body fetch that
 * already downloads that page.
 */
function extractImageFromRssFields(item: FeedItem): string | undefined {
  const mediaContentUrl = item.mediaContent?.find((entry) => entry.$?.url && (!entry.$.medium || entry.$.medium === "image"))?.$?.url;
  if (mediaContentUrl) return mediaContentUrl;

  const mediaThumbnailUrl = item.mediaThumbnail?.find((entry) => entry.$?.url)?.$?.url;
  if (mediaThumbnailUrl) return mediaThumbnailUrl;

  const enclosure = item.enclosure;
  if (enclosure?.url && enclosure.type?.startsWith("image/")) return enclosure.url;

  return undefined;
}

function extractOgImage(document: Document): string | undefined {
  const meta =
    document.querySelector('meta[property="og:image"]') ?? document.querySelector('meta[name="og:image"]');
  const content = meta?.getAttribute("content")?.trim();
  return content && content.length > 0 ? content : undefined;
}

/**
 * Second stage: fetches the article's own page and runs Mozilla's
 * Readability algorithm (the same engine behind Firefox Reader View) over
 * it to extract just the main content, stripped of navigation, ads, and
 * other boilerplate — jsdom builds the DOM Readability needs to operate on
 * (scripts are never executed; jsdom only runs them with the opt-in
 * `runScripts: "dangerously"`, which this doesn't set). Also reads the
 * page's own og:image meta tag while the DOM is still intact — Readability
 * progressively strips/mutates the document as it parses, so this has to
 * happen before `.parse()` runs, not after. Retries once on a genuinely
 * failed fetch attempt (network error/timeout) — a real HTTP response
 * (even 4xx/5xx) is not retried, since retrying won't change a real
 * server decision. Returns nulls on any unrecoverable failure — a
 * paywall, a layout Readability can't parse, or suspiciously short
 * extracted text — so the caller can fall back to the RSS-provided text.
 */
async function fetchArticlePage(url: string): Promise<{ body: string | null; ogImage?: string }> {
  for (let attempt = 1; attempt <= ARTICLE_FETCH_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "LinguABCBot/1.0 (content ingestion for an English-learning app)" },
      });
      if (!response.ok) return { body: null };

      const html = await response.text();
      const dom = new JSDOM(html, { url });
      const ogImage = extractOgImage(dom.window.document);
      const article = new Readability(dom.window.document).parse();
      if (!article?.content) return { body: null, ogImage };
      if ((article.textContent ?? "").trim().length < MIN_EXTRACTED_TEXT_LENGTH) return { body: null, ogImage };

      return { body: article.content, ogImage };
    } catch {
      if (attempt < ARTICLE_FETCH_MAX_ATTEMPTS) {
        await sleep(ARTICLE_FETCH_RETRY_DELAY_MS);
        continue;
      }
      return { body: null };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { body: null };
}

/**
 * Prefers the full article body (fetched + extracted above) over whatever
 * the RSS feed itself provided, per docs/content-engine.md — the RSS text
 * is a fallback for when the article page can't be fetched or parsed, not
 * the primary source. Preview image follows the same preference: an RSS-
 * provided media image is trusted first (cheap, no extra fetch needed),
 * then the fetched page's own og:image as a last resort.
 */
export async function mapFeedItemToRaw(item: FeedItem): Promise<RawContentItem> {
  const externalId = item.guid ?? item.link;
  if (!externalId) {
    throw new Error("RSS provider: item has neither guid nor link to use as an external id");
  }

  const rssBody = extractBodyFromRssFields(item);
  const { body: fullBody, ogImage } = item.link ? await fetchArticlePage(item.link) : { body: null, ogImage: undefined };
  const rssImage = extractImageFromRssFields(item);

  return {
    externalId,
    title: item.title ?? "Untitled",
    body: fullBody ?? rssBody,
    url: item.link,
    publishedAt: item.isoDate ?? item.pubDate,
    thumbnailUrl: rssImage ?? ogImage,
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
    for (const item of feed.items as unknown as FeedItem[]) {
      items.push(await mapFeedItemToRaw(item));
    }
    return items;
  },
};
