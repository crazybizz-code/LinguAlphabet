import { writeFileSync } from "node:fs";
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

/**
 * TEMPORARY diagnostic instrumentation for the thumbnail_url=NULL
 * production blocker. Traces one real article, by a stable title
 * substring (survives curly-vs-straight-apostrophe differences), through
 * every stage of this file's real, unmodified extraction path -- no new
 * algorithm, no new fallback, just console.log at each checkpoint. Remove
 * once the root cause is confirmed and fixed.
 */
const TRACE_TITLE_MATCH = "SAVE America Act";
function isTraceTarget(title: string | undefined): boolean {
  return typeof title === "string" && title.includes(TRACE_TITLE_MATCH);
}
function trace(stage: string, message: string): void {
  console.log(`[thumbnail-trace] ${stage}: ${message}`);
}
/** Enumerates every <img>/<figure> in an HTML fragment exactly as firstContentImage() itself will see them -- what stage 3 needs to know before extraction runs. */
function traceImageInventory(stage: string, html: string): void {
  if (!html) {
    trace(stage, "empty HTML -- 0 <img> tags, 0 <figure> tags");
    return;
  }
  const $ = cheerio.load(html);
  const imgs = $("img").toArray();
  trace(stage, `<img> tag count: ${imgs.length}`);
  imgs.forEach((img, i) => {
    const el = $(img);
    trace(stage, `  img[${i}] src=${el.attr("src") ?? "(none)"}`);
    trace(stage, `  img[${i}] srcset=${el.attr("srcset") ?? "(none)"}`);
    trace(stage, `  img[${i}] data-src=${el.attr("data-src") ?? "(none)"}`);
  });
  const figures = $("figure").toArray();
  trace(stage, `<figure> tag count: ${figures.length}`);
  figures.forEach((fig, i) => {
    trace(stage, `  figure[${i}] outerHTML=${$.html(fig)?.slice(0, 400)}`);
  });
}

/** The Conversation's article URLs end in "-<numeric id>" (confirmed
 * against the real URL used to find the share endpoint,
 * .../could-count-binface-actually-win-287611). */
function extractArticleId(articleUrl: string): string | null {
  const match = articleUrl.match(/-(\d+)\/?$/);
  return match ? match[1] : null;
}

/** First real content image in an HTML fragment -- skips The
 * Conversation's 1x1 tracking counter (also an <img>), tiny icons, and
 * anything without an absolute https URL. Checks src, then srcset/
 * data-src (lazy-loading variants). */
function firstContentImage(html: string): string | undefined {
  if (!html) return undefined;
  const $ = cheerio.load(html);
  for (const img of $("img").toArray()) {
    const el = $(img);
    const src = el.attr("src")?.trim() || el.attr("data-src")?.trim() || el.attr("srcset")?.trim().split(/[\s,]/)[0] || "";
    if (!src.startsWith("https://")) continue;
    if (el.attr("width") === "1" || el.attr("height") === "1") continue;
    if (src.includes("counter.theconversation.com")) continue;
    if (src.endsWith(".svg")) continue;
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
function extractThumbnailUrl(
  republishBody: string,
  sharePageHtml: string,
  feedItemHtml: string,
  traceTarget = false,
): string | undefined {
  const fromRepublishBody = firstContentImage(republishBody);
  const fromSharePage = fromRepublishBody ?? firstContentImage(sharePageHtml);
  const result = fromSharePage ?? firstContentImage(feedItemHtml);

  if (traceTarget) {
    trace("STAGE 4", `firstContentImage(republishBody) = ${fromRepublishBody ?? "(none)"}`);
    trace("STAGE 4", `firstContentImage(sharePageHtml) = ${fromRepublishBody ? "(skipped, layer 1 already matched)" : (firstContentImage(sharePageHtml) ?? "(none)")}`);
    trace("STAGE 4", `firstContentImage(feedItemHtml) = ${fromSharePage ? "(skipped, an earlier layer already matched)" : (firstContentImage(feedItemHtml) ?? "(none)")}`);
    // Required exact-format output for stage 4.
    console.log(result ? `Found image:\n${result}` : "No image found.");
  }

  return result;
}

async function fetchRepublishHtml(
  articleId: string,
  feedItemHtml: string,
  traceTarget = false,
): Promise<{ body: string; thumbnailUrl?: string } | null> {
  const shareUrl = `${SHARE_ENDPOINT_BASE}${articleId}`;
  if (traceTarget) trace("STAGE 2 Share page", `URL fetched: ${shareUrl}`);

  const response = await fetch(shareUrl, {
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html" },
  });
  if (!response.ok) {
    throw new Error(`The Conversation share endpoint failed: HTTP ${response.status} for article ${articleId}`);
  }

  const html = await response.text();
  if (traceTarget) {
    trace("STAGE 2 Share page", `HTML fetched: ${html.length} chars`);
    // Writes the exact bytes this run saw to disk so they can actually be
    // opened/diffed, not just measured -- /tmp is the one writable path on
    // Vercel's serverless filesystem. Best-effort: a filesystem failure
    // here must never break the real pipeline.
    try {
      writeFileSync("/tmp/thumbnail-trace-share-page.html", html);
      trace("STAGE 2 Share page", "HTML saved to /tmp/thumbnail-trace-share-page.html");
    } catch (error) {
      trace("STAGE 2 Share page", `HTML save to disk failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const $ = cheerio.load(html);
  const textarea = $('textarea[name="non-attributed-body"]');
  // .text() would be "" for a missing element -- keep the old explicit
  // null-when-absent contract instead of conflating it with empty content.
  if (textarea.length === 0) {
    if (traceTarget) trace("STAGE 2 Share page", 'no <textarea name="non-attributed-body"> found on the page');
    return null;
  }
  const body = textarea.text();
  // The textarea's own content must not be scanned as part of the share
  // page -- remove it so layer 2 only sees the page around it.
  textarea.remove();

  if (traceTarget) {
    traceImageInventory("STAGE 3 Republish HTML (non-attributed-body textarea)", body);
    traceImageInventory("STAGE 3 Share page HTML (rest of page, textarea removed)", $.html());
  }

  return { body, thumbnailUrl: extractThumbnailUrl(body, $.html(), feedItemHtml, traceTarget) };
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

      const traceTarget = isTraceTarget(item.title);
      if (traceTarget) {
        trace(
          "STAGE 1 Atom feed entry",
          `title: ${item.title ?? "(untitled)"} | link: ${item.link} | content snippet: ${(item.contentSnippet ?? "").slice(0, 300)}`,
        );
      }

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
        republish = await fetchRepublishHtml(articleId, feedItemHtml, traceTarget);
      } catch (error) {
        if (traceTarget) trace("STAGE 2/3/4", `fetchRepublishHtml threw: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (!republish) {
        if (traceTarget) trace("STAGE 2/3/4", "fetchRepublishHtml returned null (no republish textarea) -- item skipped entirely");
        continue;
      }

      if (traceTarget) trace("STAGE 5 RawContentItem.thumbnailUrl", republish.thumbnailUrl ?? "(undefined)");

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
