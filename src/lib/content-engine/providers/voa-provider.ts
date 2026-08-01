import type { ContentProvider, RawContentItem } from "../types";

/**
 * VOA Learning English — the first automated podcast provider, and the
 * proof that a podcast source needs nothing more than a ContentProvider
 * implementation to run through the shared pipeline.
 *
 * WHY VOA FIRST. It is the only source found in the licensing review that
 * names commercial use and permits it. USAGM states VOA-produced text,
 * MP3s, photos and video are in the public domain and "you are allowed to
 * reprint them for educational and commercial purposes, with credit to
 * learningenglish.voanews.com" (docs/content-source-policy.md). It is
 * also purpose-built for English learners, so the audio is already
 * graded, clearly enunciated, and published alongside a transcript.
 *
 * THE ONE CAVEAT WORTH READING. USAGM's public-domain statement covers
 * VOA-PRODUCED material. Wire-service audio and licensed music beds
 * inside an episode are not covered. `MIN_TRANSCRIPT_CHARS` and the
 * quality gate catch structurally broken items, but neither can detect
 * embedded third-party material — that stays a per-source editorial
 * check, which is why this provider is seeded DISABLED and an operator
 * must review a first run before enabling it.
 *
 * Structurally this is the RSS provider with an enclosure: same feed
 * parse, same guid-as-external-id, plus `<enclosure type="audio/*">` and
 * `<itunes:duration>`. It deliberately does NOT verify or score the
 * transcript — verifyTranscript() owns that, in the pipeline's Validate
 * stage, exactly as it does for the manual path.
 */

export const VOA_PROVIDER_ID = "voa";

/** Every episode carries the credit USAGM's terms require, captured at ingest rather than derived at render time. */
export const VOA_ATTRIBUTION = "Voice of America — learningenglish.voanews.com";
export const VOA_LICENCE = "public-domain";

/** Below this the "transcript" is a teaser or a placeholder, not something to build a lesson from. */
const MIN_TRANSCRIPT_CHARS = 400;

function textBetween(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (!match) return undefined;
  return decodeXml(match[1]).trim() || undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `<itunes:duration>` is published as either seconds ("1830") or a clock
 * ("30:30", "1:02:15"). Both appear in real feeds; returning null for an
 * unparseable value lets the quality gate reject it as "invalid duration"
 * rather than silently publishing a 0-second episode.
 */
export function parseItunesDuration(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return seconds > 0 ? seconds : null;
  }
  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? seconds : null;
}

/** `<itunes:image href="...">` carries the programme artwork as an attribute, not as element text. */
function parseItunesImage(itemXml: string): string | undefined {
  const match = /<itunes:image\b([^>]*)>/i.exec(itemXml);
  if (!match) return undefined;
  const href =
    /href\s*=\s*"([^"]+)"/i.exec(match[1])?.[1] ?? /href\s*=\s*'([^']+)'/i.exec(match[1])?.[1];
  return href ? decodeXml(href) : undefined;
}

/** The enclosure is the episode. No audio URL means there is no episode, whatever else the item carries. */
function parseEnclosure(itemXml: string): { url: string; type: string } | null {
  const match = /<enclosure\b([^>]*)>/i.exec(itemXml);
  if (!match) return null;
  const attrs = match[1];
  const url = /url\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? /url\s*=\s*'([^']+)'/i.exec(attrs)?.[1];
  const type = /type\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? "";
  if (!url) return null;
  return { url: decodeXml(url), type };
}

export function parseVoaFeed(xml: string): RawContentItem[] {
  const items: RawContentItem[] = [];

  for (const match of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const itemXml = match[0];

    const title = textBetween(itemXml, "title");
    const enclosure = parseEnclosure(itemXml);
    // Skip rather than throw: a feed legitimately mixes text-only posts in
    // with episodes, and one of those is not an error worth failing a run
    // over.
    if (!title || !enclosure) continue;
    if (enclosure.type && !enclosure.type.toLowerCase().startsWith("audio")) continue;

    const durationSeconds = parseItunesDuration(
      textBetween(itemXml, "itunes:duration") ?? textBetween(itemXml, "duration"),
    );
    if (durationSeconds === null) continue;

    // `content:encoded` is the full script where a feed carries one.
    //
    // VOA'S DO NOT. The operator recon confirmed it across all six
    // Learning English podcast feeds: audio and metadata only, no
    // content:encoded anywhere. This branch is kept because it costs
    // nothing and is correct for any feed that does carry a script, but
    // for VOA it never fires — which is why every VOA item currently
    // arrives with no transcriptRef and is dropped by the pipeline's
    // Transcript Resolution stage rather than published without one.
    const encoded = textBetween(itemXml, "content:encoded");
    const description = textBetween(itemXml, "description");
    const transcriptText = encoded ? stripHtml(encoded) : "";
    const hasTranscript = transcriptText.length >= MIN_TRANSCRIPT_CHARS;

    const link = textBetween(itemXml, "link");
    const guid = textBetween(itemXml, "guid") ?? link ?? enclosure.url;

    items.push({
      externalId: guid,
      title,
      // Filled by the pipeline's Transcript Resolution stage from
      // transcriptRef — left empty here so a provider never looks like it
      // is asserting a transcript it hasn't had verified.
      body: "",
      description: description ? stripHtml(description) : undefined,
      url: link,
      publishedAt: textBetween(itemXml, "pubDate"),
      thumbnailUrl: parseItunesImage(itemXml),
      author:
        textBetween(itemXml, "itunes:author") ??
        textBetween(itemXml, "dc:creator") ??
        textBetween(itemXml, "author"),
      audio: { url: enclosure.url, durationSeconds },
      // If the feed ever carries a script, use it. VOA's do not, so in
      // practice every VOA episode takes the ASR branch: the provider
      // names the audio and the Transcript Resolution stage generates
      // the transcript. The provider itself runs nothing.
      transcriptRef: hasTranscript
        ? { kind: "inline", text: transcriptText }
        : { kind: "asr", audioUrl: enclosure.url },
      licence: VOA_LICENCE,
      attribution: VOA_ATTRIBUTION,
      // Declared up front, and it cannot become a lie: resolution fails
      // closed, so an episode that never got a generated transcript is
      // dropped rather than persisted. Every stored `generated_asr` row
      // therefore did come from ASR.
      transcriptProvenance: hasTranscript ? "publisher" : "generated_asr",
      raw: { feedItem: itemXml },
    });
  }

  return items;
}

export const voaProvider: ContentProvider = {
  id: VOA_PROVIDER_ID,
  contentType: "podcast",

  async fetchRawItems(sourceConfig) {
    const feedUrl = sourceConfig.feedUrl;
    if (typeof feedUrl !== "string" || !feedUrl.startsWith("https://")) {
      throw new Error("VOA provider requires an https `feedUrl` in the source config");
    }

    const response = await fetch(feedUrl, { headers: { accept: "application/rss+xml, application/xml, text/xml" } });
    if (!response.ok) {
      throw new Error(`VOA feed returned HTTP ${response.status}`);
    }

    const items = parseVoaFeed(await response.text());
    const maxItems = typeof sourceConfig.maxItemsPerRun === "number" ? sourceConfig.maxItemsPerRun : 2;
    return items.slice(0, maxItems);
  },
};
