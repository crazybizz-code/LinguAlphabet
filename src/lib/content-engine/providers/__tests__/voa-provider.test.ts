import { describe, it, expect } from "vitest";
import { parseVoaFeed, parseItunesDuration, VOA_ATTRIBUTION, VOA_LICENCE } from "../voa-provider";
import { getAdapter } from "../../adapters/registry";
import { runQualityGate } from "../../publishing";
import { resolveTranscript } from "../../transcripts/resolve";
import { isAllowedAudioHost } from "../../audio";

const SCRIPT = Array.from(
  { length: 60 },
  (_, i) => `Host: Sentence number ${i} about coral reefs, ocean temperature and recovery over time.`,
).join(" ");

function feed(itemXml: string) {
  return `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>${itemXml}</channel></rss>`;
}

/**
 * REAL, captured from production: https://learningenglish.voanews.com/api/
 *
 * The site-wide Top Stories feed, which /z/1689 advertises as its only
 * <link rel="alternate">. It is valid RSS with 20 items and real
 * <enclosure> elements - the enclosures are just JPEGs. The provider must
 * yield nothing from it, and does so on the enclosure MIME type alone,
 * before duration or transcript are ever considered.
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

/**
 * PROVISIONAL. VOA's actual podcast feed has not been located yet, so
 * this is the shape a podcast item takes, not VOA's bytes. Replace it
 * with a real captured <item> as soon as the podcast feed is found - the
 * assertions below should survive that swap unchanged.
 */
const EPISODE = feed(`
  <item>
    <title>How Coral Reefs Recover</title>
    <link>https://learningenglish.voanews.com/a/coral/123.html</link>
    <guid>voa-coral-123</guid>
    <pubDate>Tue, 15 Jul 2026 12:00:00 GMT</pubDate>
    <description>A short look at how reefs bounce back.</description>
    <content:encoded><![CDATA[<p>${SCRIPT}</p>]]></content:encoded>
    <itunes:duration>5:12</itunes:duration>
    <enclosure url="https://av.voanews.com/coral-123.mp3" type="audio/mpeg" length="12000000"/>
  </item>`);

/**
 * REAL, from the As It Is feed (zoneId 3521), captured by the operator
 * recon. Every VALUE here is confirmed against production: the channel
 * title, the audio/mpeg enclosure on voa-audio.voanews.eu, the
 * 00:03:39 duration, the /a/8010609.html canonical URL, the VOA byline
 * and the programme artwork.
 *
 * The element NAMES around those values are standard iTunes RSS. If the
 * verbatim <item> shows VOA using different ones, the assertions below
 * are what should stay — they test the values the provider must extract,
 * not the tags it happens to read them from.
 *
 * NOTE WHAT IS MISSING: no <content:encoded>. That is not an omission in
 * the fixture, it is the finding — none of the six VOA feeds carries a
 * script, which is why this item cannot publish.
 */
const REAL_AS_IT_IS_ITEM = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>As It Is - VOA Learning English</title>
    <item>
      <title>Trump Says US Will Not Sign UN Climate Agreement</title>
      <link>https://learningenglish.voanews.com/a/8010609.html</link>
      <guid>https://learningenglish.voanews.com/a/8010609.html</guid>
      <pubDate>Wed, 30 Apr 2025 20:15:00 +0000</pubDate>
      <description>A short summary of today's programme.</description>
      <itunes:author>VOA Learning English</itunes:author>
      <itunes:duration>00:03:39</itunes:duration>
      <itunes:image href="https://gdb.voanews.com/as-it-is-programme-art.jpg" />
      <enclosure url="https://voa-audio.voanews.eu/vle/2025/04/30/as-it-is-8010609.mp3" length="3512000" type="audio/mpeg" />
    </item>
  </channel>
</rss>`;

describe("parseItunesDuration", () => {
  it("parses bare seconds and clock formats", () => {
    expect(parseItunesDuration("1830")).toBe(1830);
    expect(parseItunesDuration("30:30")).toBe(1830);
    expect(parseItunesDuration("1:02:15")).toBe(3735);
  });

  it("returns null for unusable values so the gate rejects rather than publishing a 0-second episode", () => {
    expect(parseItunesDuration(undefined)).toBeNull();
    expect(parseItunesDuration("0")).toBeNull();
    expect(parseItunesDuration("soon")).toBeNull();
  });
});

describe("parseVoaFeed", () => {
  it("extracts the fields an episode is made of", () => {
    const [item] = parseVoaFeed(EPISODE);
    expect(item.externalId).toBe("voa-coral-123");
    expect(item.title).toBe("How Coral Reefs Recover");
    expect(item.url).toBe("https://learningenglish.voanews.com/a/coral/123.html");
    expect(item.audio).toEqual({ url: "https://av.voanews.com/coral-123.mp3", durationSeconds: 312 });
    expect(item.publishedAt).toBe("Tue, 15 Jul 2026 12:00:00 GMT");
  });

  it("stamps licence, attribution and provenance from the source rather than guessing per item", () => {
    const [item] = parseVoaFeed(EPISODE);
    expect(item.licence).toBe(VOA_LICENCE);
    expect(item.attribution).toBe(VOA_ATTRIBUTION);
    expect(item.transcriptProvenance).toBe("publisher");
  });

  it("carries the script as a transcript reference, not as an asserted transcript", () => {
    const [item] = parseVoaFeed(EPISODE);
    expect(item.body).toBe("");
    expect(item.transcriptRef).toMatchObject({ kind: "inline" });
  });

  it("yields nothing from the real VOA Top Stories feed", () => {
    // The regression that matters most on this branch. This feed reached
    // the point of being probed and reported as a success by the first
    // recon; it must never produce a single content item.
    expect(parseVoaFeed(REAL_TOP_STORIES_FEED)).toEqual([]);
  });

  it("skips a text-only post with no enclosure instead of failing the run", () => {
    expect(parseVoaFeed(feed("<item><title>Just a post</title><guid>x</guid></item>"))).toHaveLength(0);
  });

  it("skips a non-audio enclosure", () => {
    const video = feed(`<item><title>V</title><guid>v</guid><itunes:duration>60</itunes:duration>
      <enclosure url="https://av.voanews.com/v.mp4" type="video/mp4"/></item>`);
    expect(parseVoaFeed(video)).toHaveLength(0);
  });

  it("skips an episode with no usable duration", () => {
    const noDuration = feed(`<item><title>N</title><guid>n</guid>
      <enclosure url="https://av.voanews.com/n.mp3" type="audio/mpeg"/></item>`);
    expect(parseVoaFeed(noDuration)).toHaveLength(0);
  });

  it("ignores a teaser too short to be a transcript", () => {
    const teaser = feed(`<item><title>T</title><guid>t</guid><itunes:duration>600</itunes:duration>
      <content:encoded><![CDATA[<p>Listen to today's story.</p>]]></content:encoded>
      <enclosure url="https://av.voanews.com/t.mp3" type="audio/mpeg"/></item>`);
    expect(parseVoaFeed(teaser)[0].transcriptRef).toBeUndefined();
  });
});

describe("the real As It Is item", () => {
  it("reads every field the recon confirmed against production", () => {
    const [item] = parseVoaFeed(REAL_AS_IT_IS_ITEM);

    expect(item.title).toBe("Trump Says US Will Not Sign UN Climate Agreement");
    expect(item.url).toBe("https://learningenglish.voanews.com/a/8010609.html");
    expect(item.publishedAt).toBe("Wed, 30 Apr 2025 20:15:00 +0000");
    // 00:03:39 - the clock form, not bare seconds.
    expect(item.audio?.durationSeconds).toBe(219);
    expect(item.audio?.url).toBe("https://voa-audio.voanews.eu/vle/2025/04/30/as-it-is-8010609.mp3");
    expect(item.author).toBe("VOA Learning English");
    expect(item.thumbnailUrl).toBe("https://gdb.voanews.com/as-it-is-programme-art.jpg");
    expect(item.licence).toBe(VOA_LICENCE);
    expect(item.attribution).toBe(VOA_ATTRIBUTION);
  });

  it("accepts the real audio host", () => {
    // voa-audio.voanews.eu is a subdomain of an allowlisted host, and
    // https - the two things isAllowedAudioHost actually requires.
    const [item] = parseVoaFeed(REAL_AS_IT_IS_ITEM);
    expect(isAllowedAudioHost(item.audio!.url)).toBe(true);
  });

  it("claims NO transcript and NO transcript provenance, because the feed carries neither", () => {
    const [item] = parseVoaFeed(REAL_AS_IT_IS_ITEM);
    expect(item.transcriptRef).toBeUndefined();
    // Stamping "publisher" here would record a provenance for text that
    // does not exist.
    expect(item.transcriptProvenance).toBeUndefined();
  });

  it("cannot be published: resolution fails closed rather than publishing audio with no script", async () => {
    // The behaviour that must survive every future change to this
    // provider. A VOA episode today has verified audio, a verified
    // licence and no transcript - and an episode with no transcript is
    // not a lesson, so it is dropped before the quality gate rather than
    // squeezed past it.
    const [item] = parseVoaFeed(REAL_AS_IT_IS_ITEM);
    await expect(resolveTranscript(item)).resolves.toBeNull();
  });
});

describe("VOA episode through the unified engine", () => {
  it("resolves, adapts and passes the quality gate", async () => {
    const [raw] = parseVoaFeed(EPISODE);

    const transcript = await resolveTranscript(raw);
    expect(transcript).not.toBeNull();

    const adapter = getAdapter("podcast");
    expect(adapter).toBeDefined();
    const draft = adapter!(raw, { transcript: transcript! });

    expect(draft.contentType).toBe("podcast");
    expect(draft.detailsTable).toBe("podcast_details");
    expect(draft.detailsRow.audio_url).toBe("https://av.voanews.com/coral-123.mp3");
    expect(draft.detailsRow.licence).toBe(VOA_LICENCE);
    expect(draft.detailsRow.attribution).toBe(VOA_ATTRIBUTION);
    expect(draft.detailsRow.transcript_provenance).toBe("publisher");
    expect(draft.detailsRow.source_url).toBe("https://learningenglish.voanews.com/a/coral/123.html");
    expect(draft.detailsRow.transcript_hash).toMatch(/^[a-f0-9]{64}$/);

    // The pipeline fills these post-enrichment; the gate needs them present.
    const gated = runQualityGate({ ...draft, cefrLevelMin: "B1", cefrLevelMax: "B2", topics: ["Science"], estimatedTimeMinutes: 6 });
    expect(gated.reasons).toEqual([]);
    expect(gated.passed).toBe(true);
  });

  it("gives the same content hash to the same episode under a different audio URL", async () => {
    const [raw] = parseVoaFeed(EPISODE);
    const moved = {
      ...raw,
      externalId: "voa-coral-123-reissue",
      audio: { url: "https://av.voanews.com/coral-123-v2.mp3", durationSeconds: 312 },
    };
    const transcript = await resolveTranscript(raw);
    const adapter = getAdapter("podcast")!;

    const a = adapter(raw, { transcript: transcript! });
    const b = adapter(moved, { transcript: transcript! });

    // Different ids (the URL changed) but the SAME transcript hash, which
    // is what stops the duplicate reaching learners.
    expect(a.id).not.toBe(b.id);
    expect(a.detailsRow.transcript_hash).toBe(b.detailsRow.transcript_hash);
  });
});

describe("adapter registry", () => {
  it("routes both content types", () => {
    expect(getAdapter("article")).toBeDefined();
    expect(getAdapter("podcast")).toBeDefined();
  });

  it("has no adapter for a type nobody implemented yet", () => {
    expect(getAdapter("video")).toBeUndefined();
  });
});
