import { JSDOM } from "jsdom";
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
 * rewriting, no summarizing, no re-paragraphing. It is decoded via a real
 * DOM (`textarea.value`, which is HTML-entity-decoded by definition) so
 * nothing is mis-decoded the way a hand-rolled entity table could get
 * wrong. The tracking counter and CC notice are deliberately NOT split
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

async function fetchRepublishHtml(articleId: string): Promise<string | null> {
  const response = await fetch(`${SHARE_ENDPOINT_BASE}${articleId}`, {
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html" },
  });
  if (!response.ok) {
    throw new Error(`The Conversation share endpoint failed: HTTP ${response.status} for article ${articleId}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html);
  const textarea = dom.window.document.querySelector('textarea[name="non-attributed-body"]');
  return textarea ? (textarea as HTMLTextAreaElement).value : null;
}

export const theConversationProvider: ContentProvider = {
  id: "the_conversation",
  contentType: "article",
  async fetchRawItems(sourceConfig: Record<string, unknown>): Promise<RawContentItem[]> {
    const feedUrl =
      typeof sourceConfig.feedUrl === "string" && sourceConfig.feedUrl
        ? sourceConfig.feedUrl
        : "https://theconversation.com/articles.atom";

    const parser = new Parser();
    const feed = await parser.parseURL(feedUrl);

    const items: RawContentItem[] = [];
    for (const item of feed.items) {
      const externalId = item.guid ?? item.link;
      if (!externalId || !item.link) continue;

      const articleId = extractArticleId(item.link);
      if (!articleId) continue;

      // A single fetch per article -- if it fails, this item is skipped
      // (not retried) so one broken article doesn't drop the whole feed.
      let republishHtml: string | null;
      try {
        republishHtml = await fetchRepublishHtml(articleId);
      } catch {
        continue;
      }
      if (!republishHtml) continue;

      items.push({
        externalId,
        title: item.title ?? "Untitled",
        body: republishHtml,
        url: item.link,
        publishedAt: item.isoDate ?? item.pubDate,
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
