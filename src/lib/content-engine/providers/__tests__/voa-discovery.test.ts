import { describe, it, expect } from "vitest";
import {
  classifyFeed,
  discoverFeeds,
  extractEpisodeLinks,
  parseEpisodePage,
  parseIsoDuration,
  selectPodcastFeed,
} from "../voa-discovery";
import { VOA_PROGRAMMES, findVoaProgramme, voaFeedUrl } from "../voa-programmes";

const BASE = "https://learningenglish.voanews.com/z/1689";

/**
 * FIXTURE PROVENANCE — read before changing any of these.
 *
 * REAL, captured by the operator recon against production VOA:
 *   - REAL_TOP_STORIES_LINK_TAG  the only feed /z/1689 advertises
 *   - REAL_TOP_STORIES_FEED      what that feed actually serves
 *   - the /a/8008342.html permalink shape
 *
 * PROVISIONAL, still awaiting a real capture: everything describing a
 * VOA PODCAST feed or episode page. We have not yet found VOA's podcast
 * feed, so no fixture here can honestly claim to be one. These encode
 * the shapes the code targets and are labelled at each use.
 */

/** Verbatim from the recon: the one <link rel="alternate"> on the program page. */
const REAL_TOP_STORIES_LINK_TAG =
  '<link rel="alternate" type="application/rss+xml" title="VOA - Top Stories [RSS]" href="/api/">';

/**
 * Verbatim item shape from https://learningenglish.voanews.com/api/.
 *
 * This is the feed that nearly became our podcast source. It is real RSS,
 * HTTP 200, 20 items, and it has <enclosure> elements - so every check
 * short of "is the enclosure audio" passes. The enclosure is a JPEG
 * thumbnail.
 */
const REAL_TOP_STORIES_FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Voice of America</title>
    <link>https://learningenglish.voanews.com/</link>
    <item>
      <title>Everyday Grammar Video: Ramen, A Popular Food in Japan</title>
      <link>https://learningenglish.voanews.com/a/8008342.html</link>
      <guid>https://learningenglish.voanews.com/a/8008342.html</guid>
      <pubDate>Tue, 29 Apr 2025 22:05:00 +0000</pubDate>
      <category>Everyday Grammar Video</category>
      <enclosure url="https://gdb.voanews.com/04dc51b7-6304-4483-06e7-08dd5c8b1668_tv_w800_h450.jpg" length="0" type="image/jpeg" />
    </item>
  </channel>
</rss>`;

/** PROVISIONAL: the shape a genuine podcast feed has. No real VOA capture exists yet. */
const PODCAST_FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>VOA Learning English Podcast</title>
    <item>
      <title>Episode One</title>
      <itunes:duration>5:12</itunes:duration>
      <enclosure url="https://av.voanews.com/one.mp3" length="1" type="audio/mpeg" />
    </item>
    <item>
      <title>Episode Two</title>
      <itunes:duration>6:00</itunes:duration>
      <enclosure url="https://av.voanews.com/two.mp3" length="1" type="audio/mpeg" />
    </item>
  </channel>
</rss>`;

describe("classifyFeed", () => {
  it("REJECTS the real VOA Top Stories feed that /z/1689 advertises", () => {
    const classification = classifyFeed(REAL_TOP_STORIES_FEED);

    expect(classification.isPodcastFeed).toBe(false);
    expect(classification.channelTitle).toBe("Voice of America");
    expect(classification.audioEnclosures).toBe(0);
    expect(classification.enclosureTypes).toEqual(["image/jpeg"]);
    // The rejection has to name what it actually found, or an operator
    // cannot tell a wrong feed from an unreachable one.
    expect(classification.reasons.join(" ")).toContain("image/jpeg");
    expect(classification.reasons.join(" ")).toContain("not a podcast feed");
  });

  it("accepts a feed whose items really are audio", () => {
    const classification = classifyFeed(PODCAST_FEED);
    expect(classification.isPodcastFeed).toBe(true);
    expect(classification.audioEnclosures).toBe(2);
    expect(classification.reasons).toEqual([]);
  });

  it("rejects a news feed that merely happens to contain one audio item", () => {
    const mixed = REAL_TOP_STORIES_FEED.replace(
      "</channel>",
      `<item><title>One clip</title><enclosure url="https://av.voanews.com/x.mp3" type="audio/mpeg" /></item>
       <item><title>Another photo</title><enclosure url="https://gdb.voanews.com/y.jpg" type="image/jpeg" /></item>
       <item><title>A third photo</title><enclosure url="https://gdb.voanews.com/z.jpg" type="image/jpeg" /></item></channel>`,
    );
    const classification = classifyFeed(mixed);
    expect(classification.isPodcastFeed).toBe(false);
    expect(classification.reasons.join(" ")).toContain("1 of 4 items carry audio");
  });

  it("rejects a feed with no items rather than treating empty as clean", () => {
    const empty = classifyFeed('<?xml version="1.0"?><rss><channel><title>Nothing</title></channel></rss>');
    expect(empty.isPodcastFeed).toBe(false);
    expect(empty.reasons.join(" ")).toContain("no <item> elements");
  });

  it("warns, without rejecting, when a real podcast feed omits duration or script", () => {
    const noExtras = PODCAST_FEED.replace(/<itunes:duration>[^<]*<\/itunes:duration>/g, "");
    const classification = classifyFeed(noExtras);

    expect(classification.isPodcastFeed).toBe(true);
    // parseVoaFeed() drops every item it cannot get a duration for, so
    // this warning is the difference between "0 episodes" and a run.
    expect(classification.warnings.join(" ")).toContain("skip every item");
    expect(classification.warnings.join(" ")).toContain("<content:encoded>");
  });
});

describe("selectPodcastFeed", () => {
  const respondWith = (body: string) =>
    (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

  it("returns null for the real Top Stories feed instead of accepting it", async () => {
    const result = await selectPodcastFeed(
      [{ url: "https://learningenglish.voanews.com/api/", via: "link-alternate", title: "VOA - Top Stories [RSS]" }],
      respondWith(REAL_TOP_STORIES_FEED),
    );

    expect(result.feed).toBeNull();
    expect(result.classification).toBeNull();
    expect(result.probes[0].classification?.reasons.join(" ")).toContain("image/jpeg");
  });

  it("picks the audio feed and still reports what the others were", async () => {
    const bodies: Record<string, string> = {
      "https://learningenglish.voanews.com/api/": REAL_TOP_STORIES_FEED,
      "https://learningenglish.voanews.com/api/podcast": PODCAST_FEED,
    };
    const fetchImpl = (async (url: string) => new Response(bodies[url])) as unknown as typeof fetch;

    const result = await selectPodcastFeed(
      [
        { url: "https://learningenglish.voanews.com/api/", via: "link-alternate" },
        { url: "https://learningenglish.voanews.com/api/podcast", via: "anchor" },
      ],
      fetchImpl,
    );

    expect(result.feed?.url).toBe("https://learningenglish.voanews.com/api/podcast");
    expect(result.probes).toHaveLength(2);
    expect(result.probes[0].classification?.isPodcastFeed).toBe(false);
  });

  it("records an unreachable candidate rather than throwing the run away", async () => {
    const fetchImpl = (async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;

    const result = await selectPodcastFeed([{ url: "https://learningenglish.voanews.com/api/", via: "anchor" }], fetchImpl);
    expect(result.feed).toBeNull();
    expect(result.probes[0].error).toBe("ENOTFOUND");
  });
});

describe("VOA_PROGRAMMES", () => {
  it("builds the feed URL shape the recon actually verified", () => {
    // Three recons to find this. It is not a <link rel=alternate>, not a
    // JSON config entry and not an anchor - it is VOA's own podcast
    // endpoint keyed by the programme's zone id.
    expect(voaFeedUrl(3521)).toBe("https://learningenglish.voanews.com/podcast/?zoneId=3521");
  });

  it("records the six programmes that passed classification against production", () => {
    expect(VOA_PROGRAMMES).toHaveLength(6);
    expect(VOA_PROGRAMMES.map((programme) => programme.zoneId)).toEqual([3521, 986, 1581, 5535, 4456, 7468]);
    expect(findVoaProgramme(3521)?.name).toBe("As It Is");
    expect(findVoaProgramme(9999)).toBeUndefined();
  });
});

describe("end to end: the mistake this all exists to prevent", () => {
  it("discovers the real Top Stories link tag but never selects it as a podcast feed", async () => {
    const html = `<html><head>${REAL_TOP_STORIES_LINK_TAG}</head><body></body></html>`;

    // Discovery is broad on purpose - it SHOULD surface this candidate.
    const candidates = discoverFeeds(html, BASE);
    expect(candidates).toEqual([
      { url: "https://learningenglish.voanews.com/api/", title: "VOA - Top Stories [RSS]", via: "link-alternate" },
    ]);

    // Classification is the narrow part, and it is what says no.
    const result = await selectPodcastFeed(
      candidates,
      (async () => new Response(REAL_TOP_STORIES_FEED)) as unknown as typeof fetch,
    );
    expect(result.feed).toBeNull();
  });
});

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

  it("finds feeds listed as plain anchors, which is how /podcasts and /rssfeeds publish them", () => {
    // The one place <link rel="alternate"> cannot help: a directory page
    // listing OTHER pages' feeds.
    const html = `<html><body>
      <a href="/api/">Top Stories</a>
      <a href="/podcast/lets-learn-english.xml">Let's Learn English</a>
      <a href="/z/1689">Programme page</a>
      <a href="/contact">Contact us</a>
    </body></html>`;
    const urls = discoverFeeds(html, "https://learningenglish.voanews.com/rssfeeds").map((feed) => feed.url);

    expect(urls).toContain("https://learningenglish.voanews.com/api/");
    expect(urls).toContain("https://learningenglish.voanews.com/podcast/lets-learn-english.xml");
    expect(urls).not.toContain("https://learningenglish.voanews.com/contact");
  });
});

describe("extractEpisodeLinks", () => {
  it("keeps the bare /a/<id>.html permalink VOA Learning English actually publishes", () => {
    // Captured from the real feed. The pattern used to demand a slug
    // segment and rejected this, which is why the first recon reported
    // zero episode links.
    const html = `<a href="/a/8008342.html">Everyday Grammar Video: Ramen</a>`;
    expect(extractEpisodeLinks(html, BASE)).toEqual(["https://learningenglish.voanews.com/a/8008342.html"]);
  });

  it("keeps episode permalinks and drops navigation", () => {
    const html = `<html><body>
      <a href="/a/how-coral-reefs-recover/7654321.html">Coral</a>
      <a href="/a/ocean-warming/7654322.html">Ocean</a>
      <a href="/a/8008342.html">Bare form</a>
      <a href="/z/1689">More episodes</a>
      <a href="/podcasts">Podcasts</a>
      <a href="https://www.voanews.com/a/other/999.html">Off-site</a>
    </body></html>`;
    expect(extractEpisodeLinks(html, BASE)).toEqual([
      "https://learningenglish.voanews.com/a/how-coral-reefs-recover/7654321.html",
      "https://learningenglish.voanews.com/a/ocean-warming/7654322.html",
      "https://learningenglish.voanews.com/a/8008342.html",
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
