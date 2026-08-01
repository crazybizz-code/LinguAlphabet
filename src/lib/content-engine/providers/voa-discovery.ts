import * as cheerio from "cheerio";

/**
 * VOA source discovery.
 *
 * WHY THIS EXISTS. The subscribe/RSS URL is not an `<a href>` on VOA's
 * pages, which is why scraping the rendered HTML for links finds nothing.
 * On VOA's CMS the feed is published the way feeds are supposed to be
 * published — as `<link rel="alternate" type="application/rss+xml">` in
 * `<head>` — and as an entry in a JSON config blob the page's own
 * JavaScript reads. Both are in the server-rendered HTML; neither is an
 * anchor.
 *
 * So the provider discovers its feed instead of hardcoding one. That is
 * also the more robust production strategy: a feed URL pasted into a
 * config today is a silent outage the day VOA renumbers a zone, whereas
 * discovery re-derives it from a stable program page on every run.
 *
 * TWO TIERS, in order:
 *   1. RSS discovered from a program page  — preferred, cheap, one fetch
 *   2. The program's episode listing + per-episode pages — fallback,
 *      used only when no feed is advertised
 *
 * Tier 2 is deliberately built on schema.org JSON-LD and OpenGraph rather
 * than on CSS selectors. Those are contracts the publisher maintains for
 * search engines and social cards; class names are not, and a provider
 * built on them breaks on the next redesign.
 *
 * Nothing here touches a third-party mirror or an aggregator. Every fetch
 * is to VOA's own origin.
 */

export interface DiscoveredFeed {
  url: string;
  title?: string;
  /** Where it was found — reported by the operator diagnostic so a brittle path is visible rather than silent. */
  via: "link-alternate" | "json-config";
}

/**
 * Feeds advertised by a page, in the two places a CMS actually puts them.
 *
 * Ordered: `<link rel="alternate">` first because it is the standard and
 * the least likely to change shape, JSON config second.
 */
export function discoverFeeds(html: string, baseUrl: string): DiscoveredFeed[] {
  const found: DiscoveredFeed[] = [];
  const seen = new Set<string>();

  const add = (href: string | undefined, via: DiscoveredFeed["via"], title?: string) => {
    if (!href) return;
    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    // Same-origin only. A feed link pointing at an aggregator is exactly
    // what we must not follow.
    if (new URL(absolute).hostname !== new URL(baseUrl).hostname) return;
    if (seen.has(absolute)) return;
    seen.add(absolute);
    found.push({ url: absolute, title, via });
  };

  const $ = cheerio.load(html);

  $('link[rel="alternate"]').each((_, element) => {
    const type = ($(element).attr("type") ?? "").toLowerCase();
    if (type.includes("rss") || type.includes("atom") || type.includes("xml")) {
      add($(element).attr("href"), "link-alternate", $(element).attr("title"));
    }
  });

  // The page's own JS config carries feed URLs for the subscribe menu.
  //
  // Matched by KEY, not by URL shape. VOA's feed URLs are opaque
  // (`/api/zmgpoemtkq` — no "rss", no ".xml"), so a shape-based match
  // finds nothing on the very pages this exists for. The key is the
  // reliable signal; the value is whatever the CMS decided to mint.
  for (const match of html.matchAll(/"([a-z_]*(?:rss|feed|podcast|subscribe)[a-z_]*)"\s*:\s*"([^"]+)"/gi)) {
    add(match[2].replace(/\\\//g, "/"), "json-config");
  }

  // Belt and braces: an explicit .xml/rss URL anywhere in the markup,
  // even outside a recognisable key.
  for (const match of html.matchAll(/"(https?:\\?\/\\?\/[^"]*?(?:\/rss|\.xml)[^"]*?)"/gi)) {
    add(match[1].replace(/\\\//g, "/"), "json-config");
  }

  return found;
}

/** Episode/article links on a program listing page (e.g. /z/1689), absolute and same-origin. */
export function extractEpisodeLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).hostname;
  const links = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let absolute: URL;
    try {
      absolute = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (absolute.hostname !== origin) return;
    // VOA article/episode permalinks are /a/<slug>/<id>.html. Listing
    // pages also link to zones, tags and the player shell, none of which
    // are episodes.
    if (!/\/a\/[^/]+\/\d+\.html$/.test(absolute.pathname)) return;
    absolute.hash = "";
    absolute.search = "";
    links.add(absolute.toString());
  });

  return [...links];
}

/** schema.org publishes durations as ISO-8601 ("PT12M34S"); feeds use clocks. Both appear, so both parse. */
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/i.exec(value.trim());
  if (!match) return null;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return seconds > 0 ? Math.round(seconds) : null;
}

export interface ParsedEpisodePage {
  canonicalUrl?: string;
  title?: string;
  description?: string;
  audioUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  /** The article body — VOA publishes the full script on the episode page, which is what makes a transcript possible without ASR. */
  transcriptText?: string;
}

function collectJsonLd(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html);
  const blocks: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw.trim()) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of list) {
        if (entry && typeof entry === "object") {
          blocks.push(entry as Record<string, unknown>);
          // @graph is how a CMS bundles several schema.org objects.
          const graph = (entry as Record<string, unknown>)["@graph"];
          if (Array.isArray(graph)) {
            for (const node of graph) if (node && typeof node === "object") blocks.push(node as Record<string, unknown>);
          }
        }
      }
    } catch {
      // A malformed block is skipped, never fatal — the OpenGraph and
      // DOM layers below still have a chance.
    }
  });

  return blocks;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Everything an episode needs, from one page, in layers.
 *
 * JSON-LD first (a real contract), OpenGraph second (also a contract),
 * the DOM last (a best effort). Each layer only fills what the previous
 * one left empty, so a page that publishes complete JSON-LD never
 * depends on markup at all.
 */
export function parseEpisodePage(html: string, pageUrl: string): ParsedEpisodePage {
  const $ = cheerio.load(html);
  const result: ParsedEpisodePage = {};

  // ---- Layer 1: JSON-LD ----
  for (const block of collectJsonLd(html)) {
    const type = String(block["@type"] ?? "").toLowerCase();

    if (type.includes("audioobject") || type.includes("podcastepisode") || type.includes("mediaobject")) {
      result.audioUrl ??= firstString(block.contentUrl, block.url);
      result.durationSeconds ??= parseIsoDuration(firstString(block.duration)) ?? undefined;
    }

    if (type.includes("article") || type.includes("newsarticle") || type.includes("podcastepisode")) {
      result.title ??= firstString(block.headline, block.name);
      result.description ??= firstString(block.description);
      result.publishedAt ??= firstString(block.datePublished, block.datePublished);
      result.transcriptText ??= firstString(block.articleBody, block.transcript);
      result.canonicalUrl ??= firstString(block.mainEntityOfPage, block.url);
    }

    // An `associatedMedia`/`audio` nested object is where some CMSs hide
    // the MP3 rather than emitting a standalone AudioObject.
    for (const key of ["associatedMedia", "audio", "encoding"]) {
      const nested = block[key];
      if (nested && typeof nested === "object") {
        const media = nested as Record<string, unknown>;
        result.audioUrl ??= firstString(media.contentUrl, media.url);
        result.durationSeconds ??= parseIsoDuration(firstString(media.duration)) ?? undefined;
      }
    }
  }

  // ---- Layer 2: OpenGraph / meta ----
  const meta = (property: string) =>
    $(`meta[property="${property}"]`).attr("content") ?? $(`meta[name="${property}"]`).attr("content");

  result.title ??= meta("og:title");
  result.description ??= meta("og:description");
  result.canonicalUrl ??= $('link[rel="canonical"]').attr("href") ?? meta("og:url");
  result.audioUrl ??= meta("og:audio");
  result.publishedAt ??= meta("article:published_time") ?? meta("datePublished");

  // ---- Layer 3: DOM, best effort ----
  result.audioUrl ??= $("audio source[src]").attr("src") ?? $("audio[src]").attr("src");
  if (!result.audioUrl) {
    // Player markup commonly carries the media URL in a data attribute.
    const dataUrl = $("[data-url], [data-src], [data-audio-url]")
      .map((_, element) => $(element).attr("data-url") ?? $(element).attr("data-src") ?? $(element).attr("data-audio-url"))
      .get()
      .find((value) => typeof value === "string" && /\.mp3(\?|$)/i.test(value));
    result.audioUrl ??= dataUrl;
  }

  if (!result.transcriptText) {
    // VOA renders the script as the article body. Paragraph text only —
    // no nav, no captions, no related-links furniture.
    const paragraphs = $("div.wsw p, article p")
      .map((_, element) => $(element).text().trim())
      .get()
      .filter((text) => text.length > 0);
    if (paragraphs.length > 0) result.transcriptText = paragraphs.join("\n");
  }

  // Absolutize whatever the layers produced.
  for (const key of ["audioUrl", "canonicalUrl"] as const) {
    const value = result[key];
    if (value) {
      try {
        result[key] = new URL(value, pageUrl).toString();
      } catch {
        delete result[key];
      }
    }
  }

  return result;
}
