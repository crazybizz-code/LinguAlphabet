import { describe, it, expect, vi, afterEach } from "vitest";
import {
  noaaOceanProvider,
  NOAA_OCEAN_PROVIDER_ID,
  NOAA_OCEAN_ATTRIBUTION,
  NOAA_OCEAN_LICENCE,
} from "../noaa-ocean-provider";
import { isAllowedAudioHost } from "../../audio";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function feed(itemXml: string): string {
  return `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>${itemXml}</channel></rss>`;
}

/**
 * Single well-formed NOAA Ocean Podcast episode — standard podcast RSS with
 * enclosure and itunes:duration. Audio is on oceanservice.noaa.gov, which is
 * covered by the "noaa.gov" entry in ALLOWED_AUDIO_HOSTS via subdomain rule.
 */
const EPISODE = feed(`
  <item>
    <title>The Life of a Coral Reef</title>
    <link>https://oceanservice.noaa.gov/podcasts/feb24/nop243-coral-reef.html</link>
    <guid>noaa-ocean-nop243-coral-reef</guid>
    <pubDate>Thu, 08 Feb 2024 12:00:00 +0000</pubDate>
    <description>A look at how coral reefs form and what threatens them today.</description>
    <itunes:duration>14:22</itunes:duration>
    <enclosure url="https://oceanservice.noaa.gov/podcast/feb24/nop243-coral-reef.mp3" type="audio/mpeg" length="20700000"/>
  </item>`);

/**
 * Feed with no <enclosure> at all — must yield nothing.
 */
const NO_ENCLOSURE = feed(`
  <item>
    <title>Text only</title>
    <guid>noaa-text-only</guid>
    <itunes:duration>300</itunes:duration>
  </item>`);

/**
 * Feed with a non-audio enclosure (image) — must yield nothing.
 */
const IMAGE_ENCLOSURE = feed(`
  <item>
    <title>Image item</title>
    <guid>noaa-image</guid>
    <itunes:duration>300</itunes:duration>
    <enclosure url="https://oceanservice.noaa.gov/podcast/cover.jpg" type="image/jpeg" length="50000"/>
  </item>`);

/**
 * Feed with an audio enclosure but no usable duration — must yield nothing.
 */
const NO_DURATION = feed(`
  <item>
    <title>No duration</title>
    <guid>noaa-no-dur</guid>
    <enclosure url="https://oceanservice.noaa.gov/podcast/ep.mp3" type="audio/mpeg" length="5000000"/>
  </item>`);

function makeNoaaFeed(count: number): string {
  const items = Array.from(
    { length: count },
    (_, i) => `
    <item>
      <title>NOAA Episode ${i + 1}</title>
      <guid>noaa-ep-${i + 1}</guid>
      <link>https://oceanservice.noaa.gov/podcast/ep-${i + 1}.html</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <itunes:duration>${600 + i}</itunes:duration>
      <enclosure url="https://oceanservice.noaa.gov/podcast/ep-${i + 1}.mp3" type="audio/mpeg" length="10000000"/>
    </item>`,
  ).join("");
  return `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>${items}</channel></rss>`;
}

const BASE_CONFIG = {
  feedUrl: "https://oceanservice.noaa.gov/rss/noaa-ocean-podcast.xml",
};

// ---------------------------------------------------------------------------
// 1. Provider metadata
// ---------------------------------------------------------------------------

describe("noaaOceanProvider — metadata", () => {
  it("has the expected provider id", () => {
    expect(noaaOceanProvider.id).toBe(NOAA_OCEAN_PROVIDER_ID);
    expect(noaaOceanProvider.id).toBe("noaa-ocean");
  });

  it("is registered as a podcast source, not an article source", () => {
    expect(noaaOceanProvider.contentType).toBe("podcast");
  });
});

// ---------------------------------------------------------------------------
// 2. feedUrl validation
// ---------------------------------------------------------------------------

describe("noaaOceanProvider — feedUrl validation", () => {
  it("throws when feedUrl is missing from sourceConfig", async () => {
    await expect(noaaOceanProvider.fetchRawItems({})).rejects.toThrow(
      /feedUrl/i,
    );
  });

  it("throws when feedUrl is not a string", async () => {
    await expect(
      noaaOceanProvider.fetchRawItems({ feedUrl: 42 }),
    ).rejects.toThrow(/feedUrl/i);
  });

  it("throws when feedUrl does not start with https://", async () => {
    await expect(
      noaaOceanProvider.fetchRawItems({ feedUrl: "http://oceanservice.noaa.gov/rss/noaa-ocean-podcast.xml" }),
    ).rejects.toThrow(/feedUrl/i);
  });
});

// ---------------------------------------------------------------------------
// 3. HTTP error handling
// ---------------------------------------------------------------------------

describe("noaaOceanProvider — HTTP errors", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("throws a descriptive error when the feed returns a non-2xx status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(noaaOceanProvider.fetchRawItems(BASE_CONFIG)).rejects.toThrow(
      /503/,
    );
  });
});

// ---------------------------------------------------------------------------
// 4 & 5. Attribution and licence stamping
// ---------------------------------------------------------------------------

describe("noaaOceanProvider — attribution and licence", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("overrides attribution to the NOAA credit line on every item", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => EPISODE } as Response);
    const items = await noaaOceanProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(1);
    expect(items[0].attribution).toBe(NOAA_OCEAN_ATTRIBUTION);
  });

  it("overrides licence to public-domain on every item", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => EPISODE } as Response);
    const items = await noaaOceanProvider.fetchRawItems(BASE_CONFIG);
    expect(items[0].licence).toBe(NOAA_OCEAN_LICENCE);
    expect(items[0].licence).toBe("public-domain");
  });
});

// ---------------------------------------------------------------------------
// 6, 7 & 8. feedScanWindow
// ---------------------------------------------------------------------------

describe("noaaOceanProvider — feedScanWindow", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("defaults to feedScanWindow=10 when none is configured", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => makeNoaaFeed(20) } as Response);
    const items = await noaaOceanProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(10);
  });

  it("respects an explicit feedScanWindow=5 (canary config)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => makeNoaaFeed(20) } as Response);
    const items = await noaaOceanProvider.fetchRawItems({ ...BASE_CONFIG, feedScanWindow: 5 });
    expect(items).toHaveLength(5);
  });

  it("maxItemsPerRun does NOT limit the scan window — pipeline enforces it post-dedup", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => makeNoaaFeed(20) } as Response);
    // maxItemsPerRun=1 in config must not shrink the provider scan window
    const items = await noaaOceanProvider.fetchRawItems({ ...BASE_CONFIG, maxItemsPerRun: 1 });
    expect(items).toHaveLength(10); // default feedScanWindow applies
  });
});

// ---------------------------------------------------------------------------
// 9, 10 & 11. Skipped items (via parseVoaFeed, which handles standard RSS)
// ---------------------------------------------------------------------------

describe("noaaOceanProvider — item filtering", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("skips items with no enclosure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => NO_ENCLOSURE } as Response);
    const items = await noaaOceanProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(0);
  });

  it("skips items with a non-audio enclosure (image/jpeg)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => IMAGE_ENCLOSURE } as Response);
    const items = await noaaOceanProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(0);
  });

  it("skips items with no usable duration", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => NO_DURATION } as Response);
    const items = await noaaOceanProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 12. Audio host allowlist
// ---------------------------------------------------------------------------

describe("noaaOceanProvider — audio host", () => {
  it("oceanservice.noaa.gov passes isAllowedAudioHost via the noaa.gov subdomain rule", () => {
    expect(isAllowedAudioHost("https://oceanservice.noaa.gov/podcast/ep.mp3")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13. ASR transcript path
// ---------------------------------------------------------------------------

describe("noaaOceanProvider — transcript path", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("routes episodes to ASR because NOAA does not publish inline transcripts", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => EPISODE } as Response);
    const items = await noaaOceanProvider.fetchRawItems(BASE_CONFIG);
    expect(items).toHaveLength(1);
    // No inline transcript in the NOAA feed — the item must carry an ASR ref
    expect(items[0].transcriptRef).toEqual({
      kind: "asr",
      audioUrl: "https://oceanservice.noaa.gov/podcast/feb24/nop243-coral-reef.mp3",
    });
    expect(items[0].transcriptProvenance).toBe("generated_asr");
  });
});
