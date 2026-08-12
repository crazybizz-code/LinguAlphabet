import { describe, it, expect, vi, afterEach } from "vitest";
import { parseVoaFeed, parseItunesDuration, VOA_ATTRIBUTION, VOA_LICENCE, voaProvider } from "../voa-provider";
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

  it("never mistakes a teaser for a transcript, and falls through to ASR instead", () => {
    const teaser = feed(`<item><title>T</title><guid>t</guid><itunes:duration>600</itunes:duration>
      <content:encoded><![CDATA[<p>Listen to today's story.</p>]]></content:encoded>
      <enclosure url="https://av.voanews.com/t.mp3" type="audio/mpeg"/></item>`);
    const [item] = parseVoaFeed(teaser);

    // The teaser is 25 characters. Publishing it as the transcript of a
    // 10-minute episode is the failure this threshold exists to stop.
    expect(item.transcriptRef).toEqual({ kind: "asr", audioUrl: "https://av.voanews.com/t.mp3" });
    expect(item.transcriptProvenance).toBe("generated_asr");
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

  it("routes to ASR, and never claims the publisher wrote what we generated", () => {
    const [item] = parseVoaFeed(REAL_AS_IT_IS_ITEM);

    // The feed carries no script, so the audio is the only raw material.
    expect(item.transcriptRef).toEqual({
      kind: "asr",
      audioUrl: "https://voa-audio.voanews.eu/vle/2025/04/30/as-it-is-8010609.mp3",
    });
    expect(item.transcriptProvenance).toBe("generated_asr");
  });

  it("is dropped when no transcriber is available, rather than published transcript-less", async () => {
    // Fail-closed, and specifically fail-closed on the MISSING TOOL case:
    // a pipeline run configured without a transcriber must drop ASR items
    // rather than quietly publish audio with no script.
    const [item] = parseVoaFeed(REAL_AS_IT_IS_ITEM);
    await expect(resolveTranscript(item)).resolves.toBeNull();
  });

  it("is dropped when ASR fails, returns nothing, or returns an unusable transcript", async () => {
    const [item] = parseVoaFeed(REAL_AS_IT_IS_ITEM);

    await expect(resolveTranscript(item, { transcribe: async () => null })).resolves.toBeNull();

    const empty = async () => ({
      segments: [],
      engine: "faster-whisper",
      model: "medium.en",
      audioSeconds: 219,
      wordCount: 0,
      timestampCoverage: 0,
      cacheHit: false,
      elapsedMs: 1,
      audioHash: "x",
    });
    await expect(resolveTranscript(item, { transcribe: empty })).resolves.toBeNull();

    // A truncated run: 20 words against 219 seconds of audio. This is the
    // ASR failure mode duration_consistency was already built to catch,
    // and it must reject without the gate being touched.
    const truncated = async () => ({
      segments: [{ speaker: "Speaker", text: "Just a few words that stop far too early for this episode length.", startMs: 0, endMs: 4000 }],
      engine: "faster-whisper",
      model: "medium.en",
      audioSeconds: 219,
      wordCount: 13,
      timestampCoverage: 1,
      cacheHit: false,
      elapsedMs: 1,
      audioHash: "x",
    });
    await expect(resolveTranscript(item, { transcribe: truncated })).resolves.toBeNull();
  });

  it("publishes a good ASR transcript through the unchanged gate, with word timings preserved", async () => {
    const [item] = parseVoaFeed(REAL_AS_IT_IS_ITEM);

    // ~9 words/segment x 60 = ~540 words against 219s, which is a
    // plausible ~148 wpm read.
    const segments = Array.from({ length: 60 }, (_, i) => ({
      speaker: "Speaker",
      text: `Welcome to As It Is, sentence number ${i} about the climate agreement.`,
      startMs: i * 3600,
      endMs: (i + 1) * 3600,
      words: [{ word: "Welcome", startMs: i * 3600, endMs: i * 3600 + 300 }],
    }));

    const transcript = await resolveTranscript(item, {
      transcribe: async () => ({
        segments,
        engine: "faster-whisper",
        model: "medium.en",
        audioSeconds: 219,
        wordCount: 660,
        timestampCoverage: 1,
        cacheHit: false,
        elapsedMs: 1,
        audioHash: "x",
      }),
    });
    expect(transcript).not.toBeNull();

    const draft = getAdapter("podcast")!(item, { transcript: transcript! });
    expect(draft.detailsRow.transcript_provenance).toBe("generated_asr");
    // Word timings survive persistence - they cannot be rebuilt later
    // without paying for transcription again.
    const rows = draft.detailsRow.transcript as Array<Record<string, unknown>>;
    expect(rows[0].words).toEqual([{ word: "Welcome", startMs: 0, endMs: 300 }]);

    const gated = runQualityGate({
      ...draft,
      cefrLevelMin: "B1",
      cefrLevelMax: "B2",
      topics: ["Environment"],
      estimatedTimeMinutes: 4,
      detailsRow: {
        ...draft.detailsRow,
        vocabulary: [{ word: "coral", phonetic: "", pos: "noun", translation: "", definition: "A marine organism.", example: "The coral is colorful." }],
        quiz: [{ type: "mc", question: "What is coral?", options: ["A marine organism", "A fish", "A plant", "A rock"], correct: 0, explanation: "It's in the text.", grammarTopic: null, vocabularyWord: null }],
      },
    });
    expect(gated.reasons).toEqual([]);
    expect(gated.passed).toBe(true);
  });
});

// ── voaProvider.fetchRawItems feedScanWindow ──────────────────────────────

const BASE_VOA_CONFIG = { feedUrl: "https://learningenglish.voanews.com/api/zis/3079/rss" };

function makeVoaFeed(count: number): string {
  const items = Array.from(
    { length: count },
    (_, i) => `
    <item>
      <title>Episode ${i + 1}</title>
      <guid>ep-${i + 1}</guid>
      <link>https://learningenglish.voanews.com/a/ep-${i + 1}.html</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <itunes:duration>${600 + i}</itunes:duration>
      <enclosure url="https://av.voanews.com/ep-${i + 1}.mp3" type="audio/mpeg" length="1000000"/>
    </item>`,
  ).join("");
  return `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>${items}</channel></rss>`;
}

describe("voaProvider.fetchRawItems feedScanWindow", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("defaults to feedScanWindow=10 when none is configured", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => makeVoaFeed(20) } as Response);
    const items = await voaProvider.fetchRawItems(BASE_VOA_CONFIG);
    expect(items).toHaveLength(10);
  });

  it("respects an explicit feedScanWindow", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => makeVoaFeed(20) } as Response);
    const items = await voaProvider.fetchRawItems({ ...BASE_VOA_CONFIG, feedScanWindow: 3 });
    expect(items).toHaveLength(3);
  });

  it("maxItemsPerRun no longer limits the scan window — pipeline enforces it post-dedup", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => makeVoaFeed(20) } as Response);
    // maxItemsPerRun=1 in config must not shrink the provider scan window
    const items = await voaProvider.fetchRawItems({ ...BASE_VOA_CONFIG, maxItemsPerRun: 1 });
    expect(items).toHaveLength(10); // default feedScanWindow applies, not maxItemsPerRun
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
    const gated = runQualityGate({
      ...draft,
      cefrLevelMin: "B1",
      cefrLevelMax: "B2",
      topics: ["Science"],
      estimatedTimeMinutes: 6,
      detailsRow: {
        ...draft.detailsRow,
        vocabulary: [{ word: "coral", phonetic: "", pos: "noun", translation: "", definition: "A marine organism.", example: "The coral is colorful." }],
        quiz: [{ type: "mc", question: "What is coral?", options: ["A marine organism", "A fish", "A plant", "A rock"], correct: 0, explanation: "It's in the text.", grammarTopic: null, vocabularyWord: null }],
      },
    });
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
