import { describe, it, expect } from "vitest";
import { discoverFeeds, extractEpisodeLinks, parseEpisodePage, parseIsoDuration } from "../voa-discovery";

const BASE = "https://learningenglish.voanews.com/z/1689";

/**
 * PROVISIONAL FIXTURES. These encode the *shapes* the discovery layer
 * targets — <link rel="alternate">, schema.org JSON-LD, OpenGraph — not
 * VOA's literal bytes, which the build environment cannot reach. They are
 * replaced with real captured HTML the moment the operator diagnostic
 * returns it; the assertions below should survive that swap unchanged.
 */

describe("discoverFeeds", () => {
  it("finds the feed in <link rel=alternate>, which is why href-scraping missed it", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" title="VOA Learning English Podcast" href="/api/zmgpoemtkq">
    </head><body><a href="/z/1689">Episodes</a></body></html>`;
    const feeds = discoverFeeds(html, BASE);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({
      url: "https://learningenglish.voanews.com/api/zmgpoemtkq",
      title: "VOA Learning English Podcast",
      via: "link-alternate",
    });
  });

  it("also finds a feed carried only in the page's JSON config", () => {
    const html = `<html><head></head><body>
      <script>window.__CONFIG__ = {"rssUrl":"https:\\/\\/learningenglish.voanews.com\\/api\\/zrqiteuuir"};</script>
    </body></html>`;
    const feeds = discoverFeeds(html, BASE);
    expect(feeds.map((feed) => feed.url)).toContain("https://learningenglish.voanews.com/api/zrqiteuuir");
  });

  it("never follows a feed pointing off VOA's own origin", () => {
    // Aggregator links are exactly what must not be ingested.
    const html = `<link rel="alternate" type="application/rss+xml" href="https://feeds.megaphone.fm/voa">`;
    expect(discoverFeeds(html, BASE)).toHaveLength(0);
  });

  it("deduplicates a feed advertised in both places", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="https://learningenglish.voanews.com/api/z1.xml">
    </head><body><script>var c = {"feed":"https://learningenglish.voanews.com/api/z1.xml"};</script></body></html>`;
    expect(discoverFeeds(html, BASE)).toHaveLength(1);
  });
});

describe("extractEpisodeLinks", () => {
  it("keeps episode permalinks and drops navigation", () => {
    const html = `<html><body>
      <a href="/a/how-coral-reefs-recover/7654321.html">Coral</a>
      <a href="/a/ocean-warming/7654322.html">Ocean</a>
      <a href="/z/1689">More episodes</a>
      <a href="/podcasts">Podcasts</a>
      <a href="https://www.voanews.com/a/other/999.html">Off-site</a>
    </body></html>`;
    expect(extractEpisodeLinks(html, BASE)).toEqual([
      "https://learningenglish.voanews.com/a/how-coral-reefs-recover/7654321.html",
      "https://learningenglish.voanews.com/a/ocean-warming/7654322.html",
    ]);
  });

  it("collapses query strings and fragments so one episode is one link", () => {
    const html = `<a href="/a/x/1.html?utm_source=nav">A</a><a href="/a/x/1.html#player">B</a>`;
    expect(extractEpisodeLinks(html, BASE)).toHaveLength(1);
  });
});

describe("parseIsoDuration", () => {
  it("parses the schema.org form", () => {
    expect(parseIsoDuration("PT12M34S")).toBe(754);
    expect(parseIsoDuration("PT1H2M15S")).toBe(3735);
    expect(parseIsoDuration("PT300S")).toBe(300);
  });

  it("returns null for unusable values rather than zero", () => {
    expect(parseIsoDuration(undefined)).toBeNull();
    expect(parseIsoDuration("PT0S")).toBeNull();
    expect(parseIsoDuration("12:34")).toBeNull();
  });
});

const EPISODE_URL = "https://learningenglish.voanews.com/a/how-coral-reefs-recover/7654321.html";

describe("parseEpisodePage", () => {
  it("prefers JSON-LD, which is a contract the publisher maintains", () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: "How Coral Reefs Recover",
        description: "A short look at reef recovery.",
        datePublished: "2026-07-15T12:00:00Z",
        mainEntityOfPage: EPISODE_URL,
        articleBody: "Host: Reefs can recover when the water cools.",
        associatedMedia: { "@type": "AudioObject", contentUrl: "https://av.voanews.com/coral.mp3", duration: "PT5M12S" },
      })}</script>
    </head><body></body></html>`;

    expect(parseEpisodePage(html, EPISODE_URL)).toEqual({
      title: "How Coral Reefs Recover",
      description: "A short look at reef recovery.",
      publishedAt: "2026-07-15T12:00:00Z",
      canonicalUrl: EPISODE_URL,
      transcriptText: "Host: Reefs can recover when the water cools.",
      audioUrl: "https://av.voanews.com/coral.mp3",
      durationSeconds: 312,
    });
  });

  it("falls back to OpenGraph and the DOM when JSON-LD is absent", () => {
    const html = `<html><head>
      <meta property="og:title" content="Ocean Warming">
      <meta property="og:description" content="Why the ocean is warming.">
      <meta property="article:published_time" content="2026-07-20T09:00:00Z">
      <link rel="canonical" href="${EPISODE_URL}">
    </head><body>
      <audio src="/media/ocean.mp3"></audio>
      <div class="wsw"><p>Host: The ocean absorbs most of the extra heat.</p><p>Guest: That is why it warms.</p></div>
    </body></html>`;

    const parsed = parseEpisodePage(html, EPISODE_URL);
    expect(parsed.title).toBe("Ocean Warming");
    expect(parsed.publishedAt).toBe("2026-07-20T09:00:00Z");
    // Relative media URLs are absolutized against the page they came from.
    expect(parsed.audioUrl).toBe("https://learningenglish.voanews.com/media/ocean.mp3");
    expect(parsed.transcriptText).toContain("The ocean absorbs most of the extra heat.");
    expect(parsed.transcriptText).toContain("That is why it warms.");
  });

  it("finds an MP3 hidden in player data attributes", () => {
    const html = `<html><body><div data-url="https://av.voanews.com/hidden.mp3"></div></body></html>`;
    expect(parseEpisodePage(html, EPISODE_URL).audioUrl).toBe("https://av.voanews.com/hidden.mp3");
  });

  it("survives malformed JSON-LD instead of throwing", () => {
    const html = `<html><head>
      <script type="application/ld+json">{ not json </script>
      <meta property="og:title" content="Still Works">
    </head><body></body></html>`;
    expect(parseEpisodePage(html, EPISODE_URL).title).toBe("Still Works");
  });

  it("reports nothing rather than guessing when a page carries no audio", () => {
    const html = `<html><head><meta property="og:title" content="Text only"></head><body></body></html>`;
    const parsed = parseEpisodePage(html, EPISODE_URL);
    expect(parsed.audioUrl).toBeUndefined();
    expect(parsed.durationSeconds).toBeUndefined();
  });
});
