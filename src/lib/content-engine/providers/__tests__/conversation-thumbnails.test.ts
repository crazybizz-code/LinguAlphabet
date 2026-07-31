import { describe, it, expect, vi, afterEach } from "vitest";
import { isStaticAssetUrl, extractThumbnailFromHtml } from "../../thumbnails";
import { refetchThumbnailUrl } from "../the-conversation-provider";

/** The exact URL found stored as the thumbnail for 17 different articles. */
const REAL_BADGE = "https://cdn.theconversation.com/static/tc/creative-commons-logo-abc123.png";
const REAL_PHOTO = "https://images.theconversation.com/files/123456/original/file.jpg";

afterEach(() => vi.unstubAllGlobals());

describe("isStaticAssetUrl", () => {
  it("rejects the exact Creative Commons badge that reached production", () => {
    expect(isStaticAssetUrl(REAL_BADGE)).toBe(true);
  });

  it("rejects the general class: logos, avatars, icons, favicons, badges, sprites, placeholders", () => {
    for (const url of [
      "https://x.com/assets/logo.png",
      "https://x.com/img/avatar-42.jpg",
      "https://x.com/icons/share.svg",
      "https://x.com/favicon.ico",
      "https://x.com/badges/verified.png",
      "https://x.com/sprite.png",
      "https://x.com/placeholder.jpg",
      "https://x.com/static/anything.png",
      "https://x.com/watermark.png",
    ]) {
      expect(isStaticAssetUrl(url), url).toBe(true);
    }
  });

  it("does NOT reject a real photo whose filename merely contains a matching substring", () => {
    // \bicon\b must not match "iconic" — rejecting real photos would
    // silently push good articles onto the branded cover.
    expect(isStaticAssetUrl("https://images.theconversation.com/files/1/iconic-building.jpg")).toBe(false);
    expect(isStaticAssetUrl("https://images.theconversation.com/files/1/logographic-script.jpg")).toBe(false);
    expect(isStaticAssetUrl(REAL_PHOTO)).toBe(false);
  });
});

describe("shared extractor rejects site furniture", () => {
  it("skips a CC badge in og:image and keeps looking", () => {
    const html = `<head><meta property="og:image" content="${REAL_BADGE}"></head><body><img src="${REAL_PHOTO}"></body>`;
    expect(extractThumbnailFromHtml(html)).toBe(REAL_PHOTO);
  });

  it("returns undefined when the only image is a badge", () => {
    expect(extractThumbnailFromHtml(`<body><img src="${REAL_BADGE}"></body>`)).toBeUndefined();
  });
});

describe("The Conversation og:image fallback", () => {
  const ARTICLE_URL = "https://theconversation.com/some-analysis-piece-287611";

  /** Share page with a republish body containing no inline photo — the failing shape. */
  function sharePage(bodyImages = "") {
    return `<html><body><textarea name="non-attributed-body">&lt;p&gt;Text only analysis.&lt;/p&gt;${bodyImages}</textarea></body></html>`;
  }

  it("falls back to the article page's og:image when no inline photo exists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => sharePage() })
      .mockResolvedValueOnce({ ok: true, url: ARTICLE_URL, text: async () => `<head><meta property="og:image" content="${REAL_PHOTO}"></head>` });
    vi.stubGlobal("fetch", fetchMock);

    await expect(refetchThumbnailUrl(ARTICLE_URL)).resolves.toBe(REAL_PHOTO);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never accepts a CC badge from og:image — leaves it null instead", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => sharePage() })
      .mockResolvedValueOnce({ ok: true, url: ARTICLE_URL, text: async () => `<head><meta property="og:image" content="${REAL_BADGE}"></head>` }));

    await expect(refetchThumbnailUrl(ARTICLE_URL)).resolves.toBeUndefined();
  });

  it("does NOT spend the extra request when an inline photo was already found", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => sharePage(`&lt;img src="${REAL_PHOTO}"&gt;`),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(refetchThumbnailUrl(ARTICLE_URL)).resolves.toBe(REAL_PHOTO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns undefined — never throws — when the article page itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => sharePage() })
      .mockRejectedValueOnce(new Error("ENOTFOUND")));

    await expect(refetchThumbnailUrl(ARTICLE_URL)).resolves.toBeUndefined();
  });

  it("still throws when the share page has no republish textarea — 'could not check' stays distinct from 'no photo'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<html><body>no textarea</body></html>" }));

    await expect(refetchThumbnailUrl(ARTICLE_URL)).rejects.toThrow(/no longer has a non-attributed-body textarea/i);
  });
});
