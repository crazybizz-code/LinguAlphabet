import * as cheerio from "cheerio";

/**
 * VOA source discovery.
 *
 * WHY THIS EXISTS. The subscribe/RSS URL is not an `<a href>` on VOA's
 * program pages, so scraping rendered HTML for links finds nothing. Feeds
 * live in `<link rel="alternate">` in `<head>`, in a JSON config blob the
 * page's own JavaScript reads, and — on VOA's `/podcasts` and `/rssfeeds`
 * directory pages — as ordinary anchors. All three are searched.
 *
 * WHAT THE FIRST OPERATOR RECON PROVED, and why this file now looks the
 * way it does. Running against the real `/z/1689` program page found
 * exactly one advertised feed:
 *
 *     <link rel="alternate" type="application/rss+xml"
 *           title="VOA - Top Stories [RSS]" href="/api/">
 *
 * That feed is real, returns HTTP 200, and carries 20 `<item>` elements.
 * It is also completely wrong: `<channel><title>Voice of America</title>`,
 * and its enclosures are `type="image/jpeg"` article thumbnails, not
 * audio. A program page advertises the SITE's feed, not the program's.
 *
 * The lesson is not "discovery was a bad idea" — a hardcoded feed URL
 * would have been just as wrong, and silently so. The lesson is that
 * finding an RSS feed and finding a PODCAST feed are different problems,
 * and only the second one is ours. So discovery is now deliberately
 * broad, and `classifyFeed()` is the narrow part: a candidate is a
 * podcast feed only if its items actually carry audio enclosures. The
 * site-wide Top Stories feed fails that test on the evidence in its own
 * bytes rather than on a guess about its URL.
 *
 * TWO TIERS, in order:
 *   1. A discovered feed that PASSES classification — preferred, cheap
 *   2. The program's episode listing + per-episode pages — fallback,
 *      used only when no candidate feed classifies as a podcast feed
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
  via: "link-alternate" | "json-config" | "anchor";
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

  // Anchors. VOA's /podcasts and /rssfeeds directory pages list feeds as
  // ordinary links, which is the one place `<link rel="alternate">` will
  // never help. Casting this wide is only safe because classifyFeed() is
  // what actually decides — a candidate costs one HEAD-ish fetch and is
  // rejected on its contents, not on the shape of its URL.
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    if (!/\/api\/|\/rss|\/feed|\/podcast|\.xml(\?|$)/i.test(href)) return;
    add(href, "anchor", $(element).attr("title") ?? ($(element).text().trim() || undefined));
  });

  return found;
}

export interface FeedClassification {
  channelTitle?: string;
  itemCount: number;
  /** Items whose `<enclosure>` is `type="audio/*"` — the only kind that is an episode. */
  audioEnclosures: number;
  /** Everything else: `image/jpeg` thumbnails on a news feed, `video/mp4` on a TV feed. */
  otherEnclosures: number;
  /** The distinct enclosure MIME types seen, so a rejection says WHAT it found rather than only what it wanted. */
  enclosureTypes: string[];
  hasItunesDuration: boolean;
  hasContentEncoded: boolean;
  isPodcastFeed: boolean;
  /** Why it is not a podcast feed. Empty when `isPodcastFeed` is true. */
  reasons: string[];
  /** Real problems that do not disqualify the feed — an operator must read these before enabling a source. */
  warnings: string[];
}

const ITEM_PATTERN = /<item\b[\s\S]*?<\/item>/gi;

/**
 * Decides whether a feed is a PODCAST feed, from its own bytes.
 *
 * This is the check whose absence let `/api/` — VOA's site-wide Top
 * Stories feed — be accepted as the Learning English podcast feed. It
 * parses as RSS, returns 20 items and has `<enclosure>` elements, so
 * every structural test it was given, it passed. What it does not have
 * is a single `audio/*` enclosure, because its enclosures are article
 * thumbnails.
 *
 * Deliberately NOT a relaxation of the publishing quality gate. That gate
 * is correct and untouched; this rejects the wrong SOURCE, before any
 * item reaches it.
 */
export function classifyFeed(xml: string): FeedClassification {
  const items = xml.match(ITEM_PATTERN) ?? [];
  const beforeFirstItem = xml.split(/<item\b/i)[0];
  const channelTitle = /<title[^>]*>([\s\S]*?)<\/title>/i
    .exec(beforeFirstItem)?.[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .trim();

  const types = new Set<string>();
  let audioEnclosures = 0;
  let otherEnclosures = 0;

  for (const item of items) {
    const enclosure = /<enclosure\b([^>]*)>/i.exec(item);
    if (!enclosure) continue;
    const type = (
      /type\s*=\s*"([^"]*)"/i.exec(enclosure[1])?.[1] ??
      /type\s*=\s*'([^']*)'/i.exec(enclosure[1])?.[1] ??
      ""
    ).toLowerCase();
    if (type) types.add(type);
    if (type.startsWith("audio/")) audioEnclosures += 1;
    else otherEnclosures += 1;
  }

  const hasItunesDuration = /<itunes:duration\b/i.test(xml);
  const hasContentEncoded = /<content:encoded\b/i.test(xml);

  const reasons: string[] = [];
  if (items.length === 0) {
    reasons.push("Feed contains no <item> elements");
  } else if (audioEnclosures === 0) {
    const seen = types.size > 0 ? [...types].join(", ") : "no enclosures at all";
    reasons.push(
      `No item carries an audio/* enclosure (found ${seen} across ${items.length} items) - this is an article or video feed, not a podcast feed`,
    );
  } else if (audioEnclosures * 2 < items.length) {
    // A news feed that happens to include one audio clip is still a news
    // feed. Requiring a majority is a judgement call, but the alternative
    // -- accepting on a single audio item -- is what lets a general feed
    // masquerade as a programme.
    reasons.push(
      `Only ${audioEnclosures} of ${items.length} items carry audio - a podcast feed is audio throughout, not incidentally`,
    );
  }

  const warnings: string[] = [];
  if (reasons.length === 0) {
    if (!hasItunesDuration) {
      // parseVoaFeed() drops any item it cannot get a duration for, so
      // this is the difference between "0 episodes" and a working run.
      warnings.push("No <itunes:duration> anywhere in the feed - parseVoaFeed() will skip every item until duration is read from elsewhere");
    }
    if (!hasContentEncoded) {
      warnings.push("No <content:encoded> - transcripts cannot come from the feed and must be resolved from each episode page");
    }
    if (otherEnclosures > 0) {
      warnings.push(`${otherEnclosures} of ${items.length} items carry a non-audio enclosure (${[...types].join(", ")})`);
    }
  }

  return {
    channelTitle,
    itemCount: items.length,
    audioEnclosures,
    otherEnclosures,
    enclosureTypes: [...types].sort(),
    hasItunesDuration,
    hasContentEncoded,
    isPodcastFeed: reasons.length === 0,
    reasons,
    warnings,
  };
}

export interface FeedProbe {
  url: string;
  via: DiscoveredFeed["via"];
  title?: string;
  ok: boolean;
  status: number;
  classification?: FeedClassification;
  error?: string;
}

/**
 * Probes every candidate and returns the first that is genuinely a
 * podcast feed, with the full record of what each one turned out to be.
 *
 * Fails CLOSED: no candidate classifying as a podcast feed returns null,
 * never a best guess. An ingest run that finds no podcast feed must do
 * nothing, which is strictly better than ingesting article thumbnails.
 */
export async function selectPodcastFeed(
  candidates: DiscoveredFeed[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ feed: DiscoveredFeed | null; classification: FeedClassification | null; probes: FeedProbe[] }> {
  const probes: FeedProbe[] = [];
  let selected: { feed: DiscoveredFeed; classification: FeedClassification } | null = null;

  for (const candidate of candidates) {
    try {
      const response = await fetchImpl(candidate.url, {
        headers: { accept: "application/rss+xml, application/xml, text/xml" },
      });
      if (!response.ok) {
        probes.push({ ...candidate, ok: false, status: response.status, error: `HTTP ${response.status}` });
        continue;
      }
      const classification = classifyFeed(await response.text());
      probes.push({ ...candidate, ok: true, status: response.status, classification });
      if (classification.isPodcastFeed && !selected) {
        selected = { feed: candidate, classification };
      }
    } catch (error) {
      probes.push({
        ...candidate,
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Every candidate is probed even after a winner is found, so the
  // operator report shows what else was on offer rather than stopping at
  // the first success.
  return { feed: selected?.feed ?? null, classification: selected?.classification ?? null, probes };
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
    // VOA permalinks are /a/<id>.html, and sometimes /a/<slug>/<id>.html.
    //
    // This pattern used to require the slug segment, which was wrong: the
    // real feed capture shows Learning English publishing the bare form
    // (https://learningenglish.voanews.com/a/8008342.html). That mistake
    // is why the first recon reported "0 episode links" on a page whose
    // links it simply refused to match - a false negative read as
    // evidence about VOA. Both forms are accepted now.
    if (!/^\/a\/(?:[^/]+\/)*\d+\.html$/.test(absolute.pathname)) return;
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
