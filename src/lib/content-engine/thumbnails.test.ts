import { describe, it, expect, vi, afterEach } from "vitest";
import { extractThumbnailFromHtml, extractThumbnailFromFeedItem, isFetchableImage } from "./thumbnails";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractThumbnailFromHtml", () => {
  it("prefers the publisher's own og:image over any in-body image", () => {
    const html = `
      <html><head><meta property="og:image" content="https://cdn.example.com/hero.jpg"></head>
      <body><img src="https://cdn.example.com/inline.jpg"></body></html>`;
    expect(extractThumbnailFromHtml(html)).toBe("https://cdn.example.com/hero.jpg");
  });

  it("falls back through twitter:image when og:image is absent", () => {
    const html = `<head><meta name="twitter:image" content="https://cdn.example.com/tw.jpg"></head>`;
    expect(extractThumbnailFromHtml(html)).toBe("https://cdn.example.com/tw.jpg");
  });

  it("reads feed media elements when no meta tags exist", () => {
    const xml = `<item><media:thumbnail url="https://cdn.example.com/thumb.jpg"/></item>`;
    expect(extractThumbnailFromHtml(xml)).toBe("https://cdn.example.com/thumb.jpg");
  });

  it("reads an image enclosure", () => {
    const xml = `<item><enclosure url="https://cdn.example.com/enc.jpg" type="image/jpeg"/></item>`;
    expect(extractThumbnailFromHtml(xml)).toBe("https://cdn.example.com/enc.jpg");
  });

  it("ignores a non-image enclosure so an audio file never becomes a thumbnail", () => {
    const xml = `<item><enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg"/></item>`;
    expect(extractThumbnailFromHtml(xml)).toBeUndefined();
  });

  it("falls back to the first in-body image", () => {
    const html = `<body><p>text</p><img src="https://cdn.example.com/first.jpg"></body>`;
    expect(extractThumbnailFromHtml(html)).toBe("https://cdn.example.com/first.jpg");
  });

  describe("tracking-pixel rejection", () => {
    it("skips a 1x1 declared-size image and takes the real one after it", () => {
      const html = `<body><img src="https://counter.example.com/x.gif" width="1" height="1"><img src="https://cdn.example.com/real.jpg"></body>`;
      expect(extractThumbnailFromHtml(html)).toBe("https://cdn.example.com/real.jpg");
    });

    it("skips tracking hosts/filenames even without declared dimensions — HTTP validation cannot catch these", () => {
      const html = `<body><img src="https://counter.theconversation.com/content/1/count.gif"><img src="https://cdn.example.com/real.jpg"></body>`;
      expect(extractThumbnailFromHtml(html)).toBe("https://cdn.example.com/real.jpg");
    });

    it("rejects a google-analytics beacon", () => {
      const html = `<body><img src="https://www.google-analytics.com/collect.gif"></body>`;
      expect(extractThumbnailFromHtml(html)).toBeUndefined();
    });
  });

  describe("URL normalization", () => {
    it("upgrades http to https, since next/image is https-only", () => {
      const html = `<head><meta property="og:image" content="http://cdn.example.com/a.jpg"></head>`;
      expect(extractThumbnailFromHtml(html)).toBe("https://cdn.example.com/a.jpg");
    });

    it("resolves protocol-relative URLs", () => {
      const html = `<head><meta property="og:image" content="//cdn.example.com/a.jpg"></head>`;
      expect(extractThumbnailFromHtml(html)).toBe("https://cdn.example.com/a.jpg");
    });

    it("resolves a relative image against the provided base URL instead of dropping it", () => {
      const html = `<body><img src="/media/photo.jpg"></body>`;
      expect(extractThumbnailFromHtml(html, "https://journals.example.org/article/123")).toBe("https://journals.example.org/media/photo.jpg");
    });

    it("drops a relative URL when no base is known rather than emitting an unusable value", () => {
      expect(extractThumbnailFromHtml(`<body><img src="/media/photo.jpg"></body>`)).toBeUndefined();
    });

    it("ignores inline data: images", () => {
      const html = `<body><img src="data:image/gif;base64,R0lGOD"></body>`;
      expect(extractThumbnailFromHtml(html)).toBeUndefined();
    });
  });

  it("returns undefined for empty or image-free markup", () => {
    expect(extractThumbnailFromHtml("")).toBeUndefined();
    expect(extractThumbnailFromHtml("<p>just words</p>")).toBeUndefined();
  });
});

describe("extractThumbnailFromFeedItem", () => {
  it("reads an image enclosure from a parsed feed item", () => {
    expect(extractThumbnailFromFeedItem({ enclosure: { url: "https://cdn.example.com/a.jpg", type: "image/jpeg" } }))
      .toBe("https://cdn.example.com/a.jpg");
  });

  it("ignores an audio enclosure", () => {
    expect(extractThumbnailFromFeedItem({ enclosure: { url: "https://cdn.example.com/a.mp3", type: "audio/mpeg" } }))
      .toBeUndefined();
  });

  it("reads rss-parser's nested $ attribute shape for media:content", () => {
    expect(extractThumbnailFromFeedItem({ "media:content": { $: { url: "https://cdn.example.com/m.jpg" } } }))
      .toBe("https://cdn.example.com/m.jpg");
  });

  it("returns undefined when the item carries no media at all", () => {
    expect(extractThumbnailFromFeedItem({ title: "no media here" })).toBeUndefined();
  });
});

describe("isFetchableImage", () => {
  it("accepts a 200 response with an image content-type", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "image/jpeg" }) }));
    await expect(isFetchableImage("https://cdn.example.com/a.jpg")).resolves.toBe(true);
  });

  it("rejects a 200 response that is not an image — an HTML error page is not a thumbnail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "text/html" }) }));
    await expect(isFetchableImage("https://cdn.example.com/a.jpg")).resolves.toBe(false);
  });

  it("rejects a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, headers: new Headers() }));
    await expect(isFetchableImage("https://cdn.example.com/missing.jpg")).resolves.toBe(false);
  });

  it("fails closed on a network error rather than letting an unverifiable URL through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(isFetchableImage("https://cdn.example.com/a.jpg")).resolves.toBe(false);
  });

  it("rejects a known tracking URL without making any request at all", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(isFetchableImage("https://counter.example.com/count.gif")).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
