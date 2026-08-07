import { describe, it, expect, vi, afterEach } from "vitest";
import {
  astronomyCastProvider,
  ASTRONOMY_CAST_PROVIDER_ID,
  ASTRONOMY_CAST_ATTRIBUTION,
  ASTRONOMY_CAST_LICENCE,
} from "../astronomy-cast-provider";
import { isAllowedAudioHost } from "../../audio";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function feed(itemXml: string): string {
  return `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>${itemXml}</channel></rss>`;
}

/**
 * Single well-formed Astronomy Cast episode — standard podcast RSS with
 * enclosure and itunes:duration. Audio is on traffic.libsyn.com, covered by
 * the "libsyn.com" entry in ALLOWED_AUDIO_HOSTS via the subdomain rule.
 */
const EPISODE = feed(`
  <item>
    <title>Episode 727: The Parker Solar Probe</title>
    <link>https://www.astronomycast.com/2024/02/ep-727-parker-solar-probe/</link>
    <guid>astronomycast-ep727</guid>
    <pubDate>Mon, 05 Feb 2024 00:00:00 +0000</pubDate>
    <description>We discuss the Parker Solar Probe and what it's teaching us about our star.</description>
    <itunes:duration>32:10</itunes:duration>
    <enclosure url="https://traffic.libsyn.com/astronomycast/ep727-parker-solar-probe.mp3" type="audio/mpeg" length="46000000"/>
  </item>`);

/**
 * Feed with no <enclosure> at all — must yield nothing.
 */
const NO_ENCLOSURE = feed(`
  <item>
    <title>Text only</title>
    <guid>ac-text-only</guid>
    <itunes:duration>300</itunes:duration>
  </item>`);

/**
 * Feed with a non-audio enclosure (image) — must yield nothing.
 */
const IMAGE_ENCLOSURE = feed(`
  <item>
    <title>Image item</title>
    <guid>ac-image</guid>
    <itunes:duration>300</itunes:duration>
    <enclosure url="https://traffic.libsyn.com/astronomycast/cover.jpg" type="image/jpeg" length="50000"/>
  </item>`);

/**
 * Feed with an audio enclosure but no usable duration — must yield nothing.
 */
const NO_DURATION = feed(`
  <item>
    <title>No duration</title>
    <guid>ac-no-dur</guid>
    <enclosure url="https://traffic.libsyn.com/astronomycast/ep.mp3" type="audio/mpeg" length="5000000"/>
  </item>`);

function makeAcFeed(count: number): string {
  const items = Array.from(
    { length: count },
    (_, i) => `
    <item>
      <title>Astronomy Cast Episode ${i + 1}</title>
      <guid>ac-ep-${i + 1}</guid>
      <link>https://www.astronomycast.com/ep-${i + 1}/</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <itunes:duration>${1800 + i}</itunes:duration>
      <enclosure url="https://traffic.libsyn.com/astronomycast/ep-${i + 1}.mp3" type="audio/mpeg" length="40000000"/>
    </item>`,
  ).join("");
  return `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>${items}</channel></rss>`;
}

const BASE_CONFIG = {
  feedUrl: "https://astronomycast.libsyn.com/rss",
};

// ---------------------------------------------------------------------------
// 1. Provider metadata
// ---------------------------------------------------------------------------

describe("astronomyCastProvider — metadata", () => {
  it("has the expected provider id", () => {
    expect(astronomyCastProvider.id).toBe(ASTRONOMY_CAST_PROVIDER_ID);
    expect(astronomyCastProvider.id).toBe("astronomy-cast");
  });

  it("is registered as a podcast source, not an article source", () => {
    expect(astronomyCastProvider.contentType).toBe("podcast");
  });
});

// ---------------------------------------------------------------------------
// 2. feedUrl validation
// ---------------------------------------------------------------------------

describe("astronomyCastProvider — feedUrl validation", () => {
  it("throws when feedUrl is missing from sourceConfig", async () => {
    await expect(astronomyCastProvider.fetchRawItems({})).rejects.toThrow(
      /feedUrl/i,
    );
  });

  it("throws when feedUrl is not a string", async () => {
    await expect(
      astronomyCastProvider.fetchRawItems({ feedUrl: 42 }),
    ).rejects.toThrow(/feedUrl/i);
  });

  it("throws when feedUrl does not start with https://", async () => {
    await expect(
      astronomyCastProvider.fetchRawItems({ feedUrl: "http://astronomycast.libsyn.com/rss" }),
    ).rejects.toThrow(/feedUrl/i);
  });
});

// ---------------------------------------------------------------------------
// 3. HTTP error handling
// ---------------------------------------------------------------------------

describe("astronomyCastProvider — HTTP errors", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("throws a descriptive error when the feed returns a non-2xx status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(astronomyCastProvider.fetchRawItems(BASE_CONFIG)).rejects.toThrow(
      /503/,
    );
  });
});

// ---------------------------------------------------------------------------
// 4 & 5. Attribution and licence stamping (CC BY 4.0)
// ---------------------------------------------------------------------------

describe("astronomyCastProvider — attribution and licence", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("overrides attribution to the Astronomy Cast CC BY 4.0 credit line on every item", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => EPISODE } as Response);
    const items = await astronomyCastProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(1);
    expect(items[0].attribution).toBe(ASTRONOMY_CAST_ATTRIBUTION);
    expect(items[0].attribution).toContain("Fraser Cain");
    expect(items[0].attribution).toContain("Dr. Pamela Gay");
  });

  it("overrides licence to cc-by-4.0 on every item", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => EPISODE } as Response);
    const items = await astronomyCastProvider.fetchRawItems(BASE_CONFIG);
    expect(items[0].licence).toBe(ASTRONOMY_CAST_LICENCE);
    expect(items[0].licence).toBe("cc-by-4.0");
  });

  it("does NOT stamp public-domain licence (Astronomy Cast is CC BY, not government work)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => EPISODE } as Response);
    const items = await astronomyCastProvider.fetchRawItems(BASE_CONFIG);
    expect(items[0].licence).not.toBe("public-domain");
  });
});

// ---------------------------------------------------------------------------
// 6, 7 & 8. feedScanWindow
// ---------------------------------------------------------------------------

describe("astronomyCastProvider — feedScanWindow", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("defaults to feedScanWindow=10 when none is configured", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => makeAcFeed(20) } as Response);
    const items = await astronomyCastProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(10);
  });

  it("respects an explicit feedScanWindow=5 (canary config)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => makeAcFeed(20) } as Response);
    const items = await astronomyCastProvider.fetchRawItems({ ...BASE_CONFIG, feedScanWindow: 5 });
    expect(items).toHaveLength(5);
  });

  it("maxItemsPerRun does NOT limit the scan window — pipeline enforces it post-dedup", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => makeAcFeed(20) } as Response);
    // maxItemsPerRun=1 in config must not shrink the provider scan window
    const items = await astronomyCastProvider.fetchRawItems({ ...BASE_CONFIG, maxItemsPerRun: 1 });
    expect(items).toHaveLength(10); // default feedScanWindow applies
  });
});

// ---------------------------------------------------------------------------
// 9, 10 & 11. Skipped items
// ---------------------------------------------------------------------------

describe("astronomyCastProvider — item filtering", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("skips items with no enclosure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => NO_ENCLOSURE } as Response);
    const items = await astronomyCastProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(0);
  });

  it("skips items with a non-audio enclosure (image/jpeg)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => IMAGE_ENCLOSURE } as Response);
    const items = await astronomyCastProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(0);
  });

  it("skips items with no usable duration", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => NO_DURATION } as Response);
    const items = await astronomyCastProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 12. Audio host allowlist
// ---------------------------------------------------------------------------

describe("astronomyCastProvider — audio host", () => {
  it("traffic.libsyn.com passes isAllowedAudioHost via the libsyn.com subdomain rule", () => {
    expect(isAllowedAudioHost("https://traffic.libsyn.com/astronomycast/ep727.mp3")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13. ASR transcript path
// ---------------------------------------------------------------------------

describe("astronomyCastProvider — transcript path", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("routes episodes to ASR because the Libsyn feed does not embed inline transcripts", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => EPISODE } as Response);
    const items = await astronomyCastProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(1);
    // No inline transcript in the Astronomy Cast Libsyn feed — the item must carry an ASR ref
    expect(items[0].transcriptRef).toEqual({
      kind: "asr",
      audioUrl: "https://traffic.libsyn.com/astronomycast/ep727-parker-solar-probe.mp3",
    });
    expect(items[0].transcriptProvenance).toBe("generated_asr");
  });
});
