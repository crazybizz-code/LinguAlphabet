import { describe, expect, it, vi, afterEach } from "vitest";
import Parser from "rss-parser";
import { theConversationProvider, refetchThumbnailUrl } from "../the-conversation-provider";

/**
 * Reproduces the production bug (Explore page rendering a wrong image for
 * many The Conversation articles instead of a themed local fallback):
 * firstContentImage() used to return the FIRST <img> in the republish
 * body regardless of host, so The Conversation's own required credit-block
 * logo (theconversation.com/static/..., per their Republishing Guidelines:
 * "credit... with... inclusion of their logo") was returned as the
 * article's thumbnail whenever it appeared before -- or instead of -- a
 * real content photo. Real content photos are confirmed to be served
 * exclusively from images.theconversation.com (their Imgix-backed image
 * CDN). These tests call the real, unmodified provider end-to-end
 * (fetchRawItems), mocking only the network boundary (the Atom feed and
 * the share endpoint), never reimplementing the extraction logic.
 */

const FEED_ITEM = {
  title: "Test article",
  link: "https://theconversation.com/test-article-123456",
  guid: "https://theconversation.com/test-article-123456",
  isoDate: "2026-07-01T00:00:00.000Z",
  creator: "A. Author",
};

function shareHtml(bodyInner: string): string {
  return `<html><body><textarea name="non-attributed-body">${bodyInner}</textarea></body></html>`;
}

const LOGO_IMG = `<img src="https://theconversation.com/static/logo-light.png" alt="The Conversation" />`;
const REAL_PHOTO = `<img src="https://images.theconversation.com/files/999888/original/file-2026.jpg" alt="A rugby match" />`;

function mockNetwork(shareBodyInner: string) {
  vi.spyOn(Parser.prototype, "parseURL").mockResolvedValue({ items: [FEED_ITEM] } as never);
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    text: async () => shareHtml(shareBodyInner),
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("theConversationProvider thumbnail extraction", () => {
  it("picks the real content photo, not the republishing credit logo that precedes it in the body", async () => {
    mockNetwork(`<p>Some text.</p>${LOGO_IMG}<p>More text.</p>${REAL_PHOTO}`);

    const [item] = await theConversationProvider.fetchRawItems({});

    expect(item.thumbnailUrl).toBe("https://images.theconversation.com/files/999888/original/file-2026.jpg");
  });

  it("does NOT fall back to the credit logo when the article has no real content photo at all (this is the bug this test guards against)", async () => {
    mockNetwork(`<p>Opinion piece with no inline photo.</p>${LOGO_IMG}`);

    const [item] = await theConversationProvider.fetchRawItems({});

    // Before the fix, this returned the logo URL (a real, loadable, but
    // wrong image) -- which the UI then rendered as the thumbnail with no
    // error anywhere in the pipeline. It must come back undefined instead,
    // so the existing local themed-fallback tier (thumbnailFallback.ts)
    // handles it, exactly as it already does for every other article with
    // no extractable image.
    expect(item.thumbnailUrl).toBeUndefined();
  });
});

/**
 * Broader verification pass, standing in for a live spot-check of 20 real
 * production articles: this sandbox has no network access to
 * theconversation.com (org egress policy denies it -- confirmed via
 * /root/.ccr/README.md's proxy status endpoint) and no live Supabase
 * credentials, so 20 REAL articles can't be pulled directly (the same
 * constraint stated in every prior audit in docs/content-quality-audit*.md
 * and docs/explore-content-quality-sprint-report.md). These 20 cases cover
 * every realistic image arrangement the real HTML could plausibly put in
 * front of the real, unmodified extractor -- run the exact SQL at the
 * bottom of this file against production once deployed to get the real
 * per-article numbers.
 */
const PHOTO_A = `<img src="https://images.theconversation.com/files/100001/original/a.jpg" />`;
const PHOTO_B = `<img src="https://images.theconversation.com/files/100002/original/b.jpg" />`;
const AVATAR_IMG = `<img src="https://theconversation.com/avatars/author-42.png" alt="Author headshot" />`;
const COUNTER_PIXEL = `<img src="https://counter.theconversation.com/count/abcd1234.gif" width="1" height="1" />`;
const TRACKING_PIXEL_ON_CDN = `<img src="https://images.theconversation.com/pixel.gif" width="1" height="1" />`;
const LOOKALIKE_HOST_PHOTO = `<img src="https://images.theconversation.com.evil.example/files/1/x.jpg" />`;
const SUBDOMAIN_VARIANT_PHOTO = `<img src="https://cdn.images.theconversation.com/files/1/x.jpg" />`;
const HTTP_PHOTO = `<img src="http://images.theconversation.com/files/1/insecure.jpg" />`;
const LAZY_PHOTO = `<img data-src="https://images.theconversation.com/files/100003/original/lazy.jpg" alt="" />`;
const SRCSET_PHOTO = `<img srcset="https://images.theconversation.com/files/100004/original/c.jpg 640w" alt="" />`;
const SVG_LOGO = `<img src="https://theconversation.com/static/badge.svg" alt="CC BY-ND" />`;

interface Case {
  name: string;
  body: string;
  sharePageExtra?: string;
  feedItemHtml?: string;
  expected: string | undefined;
}

const CASES: Case[] = [
  { name: "1. photo only", body: `<p>Text</p>${PHOTO_A}`, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "2. logo then photo", body: `${LOGO_IMG}<p>Text</p>${PHOTO_A}`, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "3. photo then logo", body: `${PHOTO_A}<p>Text</p>${LOGO_IMG}`, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "4. logo only, no photo (the reported bug)", body: `<p>Opinion piece.</p>${LOGO_IMG}`, expected: undefined },
  { name: "5. tracking counter only, no photo", body: `<p>Text</p>${COUNTER_PIXEL}`, expected: undefined },
  { name: "6. counter pixel before photo", body: `${COUNTER_PIXEL}${PHOTO_A}`, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "7. two real photos — first wins", body: `${PHOTO_A}${PHOTO_B}`, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "8. lazy-loaded photo via data-src", body: `${LAZY_PHOTO}`, expected: "https://images.theconversation.com/files/100003/original/lazy.jpg" },
  { name: "9. photo only in srcset", body: `${SRCSET_PHOTO}`, expected: "https://images.theconversation.com/files/100004/original/c.jpg" },
  { name: "10. CC/attribution badge svg, no photo", body: `<p>Text</p>${SVG_LOGO}`, expected: undefined },
  { name: "11. plain-http photo is rejected (not https)", body: `${HTTP_PHOTO}<p>Text</p>${PHOTO_A}`, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "12. 1x1 pixel served from the real CDN host is still excluded", body: `${TRACKING_PIXEL_ON_CDN}${PHOTO_A}`, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "13. empty body, no images anywhere", body: ``, expected: undefined },
  { name: "14. photo only on the share page (outside the textarea)", body: `<p>Text</p>${LOGO_IMG}`, sharePageExtra: PHOTO_A, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "15. photo only in the Atom feed entry's own markup", body: `<p>Text</p>${LOGO_IMG}`, feedItemHtml: PHOTO_A, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "16. no photo anywhere at all (body, share page, or feed)", body: `<p>Text</p>${LOGO_IMG}`, expected: undefined },
  { name: "17. logos on both sides of the one real photo", body: `${LOGO_IMG}${AVATAR_IMG}${PHOTO_A}${LOGO_IMG}`, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "18. lookalike host (…theconversation.com.evil.example) is rejected", body: `${LOOKALIKE_HOST_PHOTO}<p>Text</p>${PHOTO_A}`, expected: "https://images.theconversation.com/files/100001/original/a.jpg" },
  { name: "19. unrecognized subdomain variant is rejected, not just any *.theconversation.com", body: `${SUBDOMAIN_VARIANT_PHOTO}`, expected: undefined },
  { name: "20. author avatar (not the CDN host) is skipped for the real photo after it", body: `${AVATAR_IMG}<p>Text</p>${PHOTO_B}`, expected: "https://images.theconversation.com/files/100002/original/b.jpg" },
];

describe.each(CASES)("verification case: $name", ({ body, sharePageExtra, feedItemHtml, expected }) => {
  it(`extracts the correct thumbnail (or none)`, async () => {
    vi.spyOn(Parser.prototype, "parseURL").mockResolvedValue({
      items: [{ ...FEED_ITEM, content: feedItemHtml ?? "" }],
    } as never);
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => `<html><body>${sharePageExtra ?? ""}<textarea name="non-attributed-body">${body}</textarea></body></html>`,
    } as Response);

    const [item] = await theConversationProvider.fetchRawItems({});

    expect(item.thumbnailUrl).toBe(expected);
    vi.restoreAllMocks();
  });
});

/**
 * refetchThumbnailUrl (scripts/backfill-conversation-thumbnails.mjs's only
 * entry point into this file) must distinguish "confirmed no photo" from
 * "couldn't determine at all" -- the backfill script relies on the second
 * case throwing so it skips the row instead of writing an empty
 * thumbnail_url over one it never actually got to inspect.
 */
describe("refetchThumbnailUrl", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the real photo URL when one is found", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => `<html><body><textarea name="non-attributed-body">${PHOTO_A}</textarea></body></html>`,
    } as Response);

    await expect(refetchThumbnailUrl("https://theconversation.com/some-article-123456")).resolves.toBe(
      "https://images.theconversation.com/files/100001/original/a.jpg",
    );
  });

  it("returns undefined (confirmed empty) when the body was inspected and genuinely has no CDN photo", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => `<html><body><textarea name="non-attributed-body"><p>Opinion piece.</p>${LOGO_IMG}</textarea></body></html>`,
    } as Response);

    await expect(refetchThumbnailUrl("https://theconversation.com/some-article-123456")).resolves.toBeUndefined();
  });

  it("throws (does not return undefined) when the stored URL has no parseable article id", async () => {
    await expect(refetchThumbnailUrl("https://theconversation.com/no-numeric-id-here")).rejects.toThrow();
  });

  it("throws (does not return undefined) when the share page no longer has the republish textarea", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => `<html><body><p>This article has been removed.</p></body></html>`,
    } as Response);

    await expect(refetchThumbnailUrl("https://theconversation.com/some-article-123456")).rejects.toThrow();
  });

  it("throws (does not return undefined) when the share endpoint itself fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404 } as Response);

    await expect(refetchThumbnailUrl("https://theconversation.com/some-article-123456")).rejects.toThrow();
  });
});

/*
Real per-article production numbers, once deployed and ingestion has run
again with this fix (mirrors the query at the end of
docs/explore-content-quality-sprint-report.md):

select
  ci.id, ci.title, ci.thumbnail_url,
  (ci.thumbnail_url is not null and ci.thumbnail_url != '') as has_real_thumbnail
from content_items ci
where ci.content_type = 'article' and ci.status = 'published'
order by ci.published_at desc
limit 20;
*/
