import * as cheerio from "cheerio";
import Parser from "rss-parser";
import type { ContentProvider, RawContentItem } from "../types";

/**
 * The Conversation — republished under CC BY-ND (Attribution-NoDerivatives),
 * confirmed via docs/content-source-policy.md. ND means the text may not
 * be altered at all beyond the publisher's own house-style exceptions --
 * stricter than every other license this project has used (CC BY, CC0,
 * public domain).
 *
 * Compliance-driven design, confirmed via a real Playwright network
 * capture of the "Republish this article" button (not guessed, not
 * scraped from the public page):
 *
 *   GET https://theconversation.com/share/{articleId}
 *
 * returns an HTML page whose `<textarea name="non-attributed-body">`
 * holds The Conversation's own complete required republish package --
 * article body, author attribution, Creative Commons notice, and their
 * tracking counter, all bundled together by them, not assembled here.
 *
 * `body` below is that textarea's value taken exactly as given -- no
 * rewriting, no summarizing, no re-paragraphing. Parsed with cheerio
 * (parse5-based, spec-compliant RCDATA/entity handling -- `.text()` on a
 * textarea yields the same decoded value a real DOM's `textarea.value`
 * would) rather than jsdom: jsdom is in Next's serverExternalPackages
 * list, so it is require()d unbundled at runtime, and its dependency
 * chain (html-encoding-sniffer -> @exodus/bytes) is ESM-only, which
 * fails that require with ERR_REQUIRE_ESM on Vercel. cheerio is bundled
 * by Next like any normal dependency, so no runtime require happens at
 * all. The tracking counter and CC notice are deliberately NOT split
 * out of `body` -- ReadingStep.tsx has no separate slot to re-render them
 * if they were, and CC BY-ND prohibits recombining/altering the package
 * The Conversation hands over anyway. `author`/original URL are preserved
 * a second time, verbatim, inside `raw` (-> content_raw_items.raw_payload).
 *
 * No Readability, no page scraping, no retries: one feed fetch, one
 * share-endpoint fetch per article, nothing else.
 */

const SHARE_ENDPOINT_BASE = "https://theconversation.com/share/";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** The Conversation's article URLs end in "-<numeric id>" (confirmed
 * against the real URL used to find the share endpoint,
 * .../could-count-binface-actually-win-287611). */
function extractArticleId(articleUrl: string): string | null {
  const match = articleUrl.match(/-(\d+)\/?$/);
  return match ? match[1] : null;
}

/**
 * The Conversation serves every real article/editorial photo through its
 * own dedicated Imgix-backed image CDN, images.theconversation.com --
 * confirmed independently of this project's own guesswork (Imgix's own
 * listing of them as a customer at images.theconversation.com, separate
 * from theconversation.com itself). Nothing else legitimately comes from
 * that host: not the 1x1 tracking counter (counter.theconversation.com --
 * a different host), not the site logo/CC-license credit block the
 * Republishing Guidelines require ("credit... with... inclusion of their
 * logo"), not an author headshot. Filtering by this host, not by trying
 * to blocklist every kind of non-article image individually, is what
 * makes this correct: any image this provider now returns is provably a
 * real content photo, not just "the first <img> tag that happened not to
 * match a known bad pattern."
 */
const CONTENT_IMAGE_HOST = "images.theconversation.com";

/** First real content image in an HTML fragment -- requires the confirmed
 * content-image CDN host (see CONTENT_IMAGE_HOST above), so a logo, CC
 * badge, author avatar, or tracking pixel served from theconversation.com
 * itself (or any other host) is never mistaken for an article photo, no
 * matter where it falls in the document. Checks src, then srcset/
 * data-src (lazy-loading variants). */
function firstContentImage(html: string): string | undefined {
  if (!html) return undefined;
  const $ = cheerio.load(html);
  for (const img of $("img").toArray()) {
    const el = $(img);
    const src = el.attr("src")?.trim() || el.attr("data-src")?.trim() || el.attr("srcset")?.trim().split(/[\s,]/)[0] || "";
    if (!src.startsWith("https://")) continue;
    let hostname: string;
    try {
      hostname = new URL(src).hostname;
    } catch {
      continue;
    }
    if (hostname !== CONTENT_IMAGE_HOST) continue;
    if (el.attr("width") === "1" || el.attr("height") === "1") continue;
    return src;
  }
  return undefined;
}

/** Layered thumbnail extraction, all from documents already in hand (no
 * extra requests): the republish package's own images first, then any
 * article image elsewhere on the share page (the "non-attributed" body
 * may legitimately contain no <img> at all -- The Conversation's
 * republish text is text-focused), then whatever image the Atom entry's
 * own content markup carries. Which layer fired is reported by
 * scripts/check-conversation-provider.mjs for real-feed verification. */
function extractThumbnailUrl(republishBody: string, sharePageHtml: string, feedItemHtml: string): string | undefined {
  return firstContentImage(republishBody) ?? firstContentImage(sharePageHtml) ?? firstContentImage(feedItemHtml);
}

/**
 * Backfill entry point (scripts/backfill-conversation-thumbnails.mjs):
 * re-derives just the corrected thumbnailUrl for one already-published
 * article, given its stored source URL, by calling the exact same
 * fetchRepublishHtml/extractThumbnailUrl/firstContentImage code path
 * fetchRawItems uses for new articles -- never a reimplementation. Feed-
 * entry markup (extraction layer 3) isn't available here since the
 * original Atom entry isn't refetched, only layers 1-2 (republish body,
 * rest of the share page) -- the same two layers that resolve the large
 * majority of real articles.
 *
 * Deliberately throws rather than returning undefined when the article
 * couldn't be re-checked at all (no parseable article id in the stored
 * URL, or the share page's republish textarea is missing this time around
 * -- e.g. the article was pulled or the page structure changed since
 * original ingestion). Both are "couldn't determine," not "confirmed no
 * photo" -- undefined is reserved for the one real confirmed-empty case:
 * the article body WAS fetched and parsed and genuinely contains no
 * content-CDN image. Collapsing "couldn't check" into the same undefined
 * as "confirmed empty" would make the backfill script blank out a
 * thumbnail it never actually got to inspect -- the caller's job is to
 * treat a thrown error as "skip, don't touch this row," exactly like any
 * other extraction failure.
 */
export async function refetchThumbnailUrl(sourceUrl: string): Promise<string | undefined> {
  const articleId = extractArticleId(sourceUrl);
  if (!articleId) throw new Error(`Could not parse an article id out of stored source_url: ${sourceUrl}`);
  const republish = await fetchRepublishHtml(articleId, "");
  if (!republish) {
    throw new Error(`Share page for article ${articleId} no longer has a non-attributed-body textarea -- can't confirm whether a photo exists`);
  }
  return republish.thumbnailUrl;
}

async function fetchRepublishHtml(articleId: string, feedItemHtml: string): Promise<{ body: string; thumbnailUrl?: string } | null> {
  const shareUrl = `${SHARE_ENDPOINT_BASE}${articleId}`;

  const response = await fetch(shareUrl, {
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html" },
  });
  if (!response.ok) {
    throw new Error(`The Conversation share endpoint failed: HTTP ${response.status} for article ${articleId}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const textarea = $('textarea[name="non-attributed-body"]');
  // .text() would be "" for a missing element -- keep the old explicit
  // null-when-absent contract instead of conflating it with empty content.
  if (textarea.length === 0) {
    return null;
  }
  const body = textarea.text();
  // The textarea's own content must not be scanned as part of the share
  // page -- remove it so layer 2 only sees the page around it.
  textarea.remove();

  return { body, thumbnailUrl: extractThumbnailUrl(body, $.html(), feedItemHtml) };
}

export const theConversationProvider: ContentProvider = {
  id: "the_conversation",
  contentType: "article",
  async fetchRawItems(sourceConfig: Record<string, unknown>): Promise<RawContentItem[]> {
    const feedUrl =
      typeof sourceConfig.feedUrl === "string" && sourceConfig.feedUrl
        ? sourceConfig.feedUrl
        : "https://theconversation.com/articles.atom";

    // Caps BOTH the share-endpoint fetches below and the downstream
    // Gemini enrichment volume, so one run fits inside the route's
    // maxDuration. The feed is newest-first, so this takes the N newest;
    // the pipeline's processed_at idempotency makes re-runs cheap.
    // Tunable per source via content_sources.config -- a DB row edit,
    // no deploy.
    const maxItemsPerRun = typeof sourceConfig.maxItemsPerRun === "number" && sourceConfig.maxItemsPerRun > 0 ? sourceConfig.maxItemsPerRun : 5;

    const parser = new Parser();
    const feed = await parser.parseURL(feedUrl);

    const items: RawContentItem[] = [];
    for (const item of feed.items.slice(0, maxItemsPerRun)) {
      const externalId = item.guid ?? item.link;
      if (!externalId || !item.link) continue;

      const articleId = extractArticleId(item.link);
      if (!articleId) continue;

      // rss-parser maps an Atom entry's <content> onto .content and
      // <summary> onto .summary/.contentSnippet -- either may carry the
      // entry's own image markup, used as the last extraction layer.
      const feedItemHtml =
        (typeof item.content === "string" ? item.content : "") ||
        (typeof (item as Record<string, unknown>).summary === "string" ? ((item as Record<string, unknown>).summary as string) : "");

      // A single fetch per article -- if it fails, this item is skipped
      // (not retried) so one broken article doesn't drop the whole feed.
      let republish: { body: string; thumbnailUrl?: string } | null;
      try {
        republish = await fetchRepublishHtml(articleId, feedItemHtml);
      } catch {
        continue;
      }
      if (!republish) continue;

      items.push({
        externalId,
        title: item.title ?? "Untitled",
        body: republish.body,
        url: item.link,
        publishedAt: item.isoDate ?? item.pubDate,
        thumbnailUrl: republish.thumbnailUrl,
        author: item.creator,
        raw: {
          feedItem: item,
          articleId,
          shareUrl: `${SHARE_ENDPOINT_BASE}${articleId}`,
          author: item.creator,
          originalUrl: item.link,
        },
      });
    }
    return items;
  },
};
