import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTranscript, getPublishedPodcasts, getPodcastById, MIN_CATALOG_DURATION_SECONDS, MAX_CATALOG_DURATION_SECONDS } from "./queries";

describe("normalizeTranscript", () => {
  it("returns an empty array for null/undefined/non-array", () => {
    expect(normalizeTranscript(null)).toEqual([]);
    expect(normalizeTranscript(undefined)).toEqual([]);
    expect(normalizeTranscript("string")).toEqual([]);
    expect(normalizeTranscript(42)).toEqual([]);
  });

  it("returns an empty array for an empty array", () => {
    expect(normalizeTranscript([])).toEqual([]);
  });

  it("normalizes snake_case start_ms/end_ms (VOA pipeline) to camelCase", () => {
    const raw = [{ speaker: "HOST", text: "Hello world.", start_ms: 1000, end_ms: 3000 }];
    const result = normalizeTranscript(raw);
    expect(result).toHaveLength(1);
    expect(result[0].startMs).toBe(1000);
    expect(result[0].endMs).toBe(3000);
    expect(result[0].speaker).toBe("HOST");
    expect(result[0].text).toBe("Hello world.");
  });

  it("passes through already-camelCase startMs/endMs (BBC seed) unchanged", () => {
    const raw = [{ speaker: "PRESENTER", text: "Good morning.", startMs: 500, endMs: 2500 }];
    const result = normalizeTranscript(raw);
    expect(result[0].startMs).toBe(500);
    expect(result[0].endMs).toBe(2500);
  });

  it("camelCase takes precedence over snake_case when both are present", () => {
    const raw = [{ speaker: "A", text: "x", startMs: 100, endMs: 200, start_ms: 999, end_ms: 999 }];
    const result = normalizeTranscript(raw);
    expect(result[0].startMs).toBe(100);
    expect(result[0].endMs).toBe(200);
  });

  it("defaults missing timestamps to 0", () => {
    const raw = [{ speaker: "A", text: "y" }];
    const result = normalizeTranscript(raw);
    expect(result[0].startMs).toBe(0);
    expect(result[0].endMs).toBe(0);
  });

  it("normalizes word-level snake_case timestamps in ASR segments", () => {
    const raw = [
      {
        speaker: "S1",
        text: "hi there",
        start_ms: 0,
        end_ms: 1000,
        words: [
          { word: "hi", start_ms: 0, end_ms: 400 },
          { word: "there", start_ms: 450, end_ms: 900 },
        ],
      },
    ];
    const result = normalizeTranscript(raw);
    expect(result[0].words).toHaveLength(2);
    expect(result[0].words![0]).toEqual({ word: "hi", startMs: 0, endMs: 400 });
    expect(result[0].words![1]).toEqual({ word: "there", startMs: 450, endMs: 900 });
  });

  it("normalizes word-level camelCase timestamps unchanged", () => {
    const raw = [
      {
        speaker: "S1",
        text: "hello",
        startMs: 0,
        endMs: 500,
        words: [{ word: "hello", startMs: 0, endMs: 500 }],
      },
    ];
    const result = normalizeTranscript(raw);
    expect(result[0].words![0]).toEqual({ word: "hello", startMs: 0, endMs: 500 });
  });

  it("omits words key when words array is absent", () => {
    const raw = [{ speaker: "A", text: "no words", startMs: 0, endMs: 1000 }];
    const result = normalizeTranscript(raw);
    expect(result[0].words).toBeUndefined();
  });

  it("omits words key when words array is empty", () => {
    const raw = [{ speaker: "A", text: "no words", startMs: 0, endMs: 1000, words: [] }];
    const result = normalizeTranscript(raw);
    expect(result[0].words).toBeUndefined();
  });

  it("handles multiple segments correctly", () => {
    const raw = [
      { speaker: "A", text: "first", start_ms: 0, end_ms: 1000 },
      { speaker: "B", text: "second", startMs: 1100, endMs: 2000 },
    ];
    const result = normalizeTranscript(raw);
    expect(result).toHaveLength(2);
    expect(result[0].startMs).toBe(0);
    expect(result[1].startMs).toBe(1100);
  });
});

/**
 * LinguABC catalog-cleanup regression tests. The website-facing podcast
 * catalog (getPublishedPodcasts/getPodcastById -- the single shared
 * data-access layer every page/consumer calls) must exclude any episode
 * outside the 300-360s product range, REGARDLESS of source, while never
 * touching the underlying content_items/podcast_details rows -- this is
 * proven by testing the query layer itself, not by deleting fixture data.
 * Real IDs from the actual production find are used deliberately.
 */

interface FakeContentItemRow {
  id: string;
  content_type: string;
  status: string;
  title: string;
  featured: boolean;
  published_at: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface FakePodcastDetailsRow {
  content_item_id: string;
  duration_seconds: number;
  attribution: string | null;
  audio_url: string;
  [key: string]: unknown;
}

function baseItemFields(overrides: Partial<FakeContentItemRow>): FakeContentItemRow {
  return {
    id: "x",
    content_type: "podcast",
    status: "published",
    title: "Untitled",
    description: "",
    cefr_level_min: "B2",
    cefr_level_max: "B2",
    topics: [],
    skills: [],
    goal_alignment: [],
    tags: [],
    estimated_time_minutes: 5,
    thumbnail_url: "",
    featured: false,
    premium: false,
    published_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function baseDetailsFields(overrides: Partial<FakePodcastDetailsRow>): FakePodcastDetailsRow {
  return {
    content_item_id: "x",
    audio_url: "https://example.com/ep.mp3",
    duration_seconds: 330,
    transcript: [],
    summary: "",
    takeaways: [],
    vocabulary: [],
    quiz: [],
    reflection: "",
    attribution: null,
    ...overrides,
  };
}

function fakeSupabase(items: FakeContentItemRow[], details: FakePodcastDetailsRow[]): SupabaseClient {
  function contentItemsQuery(rows: FakeContentItemRow[]) {
    const builder = {
      _rows: rows,
      select: () => builder,
      eq: (col: string, val: unknown) => {
        builder._rows = builder._rows.filter((r) => r[col] === val);
        return builder;
      },
      order: () => builder,
      maybeSingle: async () => ({ data: builder._rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: FakeContentItemRow[]; error: null }) => void) => resolve({ data: builder._rows, error: null }),
    };
    return builder;
  }

  function podcastDetailsQuery(rows: FakePodcastDetailsRow[]) {
    const builder = {
      _rows: rows,
      select: () => builder,
      eq: (col: string, val: unknown) => {
        builder._rows = builder._rows.filter((r) => r[col] === val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        builder._rows = builder._rows.filter((r) => vals.includes(r[col]));
        return builder;
      },
      gte: (col: string, val: number) => {
        builder._rows = builder._rows.filter((r) => (r[col] as number) >= val);
        return builder;
      },
      lte: (col: string, val: number) => {
        builder._rows = builder._rows.filter((r) => (r[col] as number) <= val);
        return builder;
      },
      maybeSingle: async () => ({ data: builder._rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: FakePodcastDetailsRow[]; error: null }) => void) => resolve({ data: builder._rows, error: null }),
    };
    return builder;
  }

  return {
    from: (table: string) => {
      if (table === "content_items") return contentItemsQuery([...items]);
      if (table === "podcast_details") return podcastDetailsQuery([...details]);
      throw new Error(`fakeSupabase: unexpected table '${table}'`);
    },
  } as unknown as SupabaseClient;
}

// Real production data from the catalog-cleanup finding.
const NOAA_16MIN_ID = "podcast-358f9bb03f1f211e";
const NOAA_52MIN_ID = "podcast-149f39579b6f7754";
const LINGUABC_ID = "podcast-25dd8a112241a7a0";
const EXTERNAL_B1_ID = "podcast-external-b1-ok";

const ITEMS: FakeContentItemRow[] = [
  baseItemFields({ id: LINGUABC_ID, title: "Why Do People Clap When the Plane Lands?", cefr_level_min: "B2", cefr_level_max: "B2" }),
  baseItemFields({ id: NOAA_16MIN_ID, title: "Coastal Conversation: Harmful algal bloom forecasting in Alaska", cefr_level_min: "B1", cefr_level_max: "B1" }),
  baseItemFields({ id: NOAA_52MIN_ID, title: "The USS Monitor, Part 1: History and Legacy", cefr_level_min: "B1", cefr_level_max: "B1" }),
  baseItemFields({ id: EXTERNAL_B1_ID, title: "A short approved external B1 episode", cefr_level_min: "B1", cefr_level_max: "B1" }),
];

const DETAILS: FakePodcastDetailsRow[] = [
  baseDetailsFields({ content_item_id: LINGUABC_ID, duration_seconds: 330, attribution: "LinguABC" }),
  baseDetailsFields({ content_item_id: NOAA_16MIN_ID, duration_seconds: 962, attribution: "NOAA National Ocean Service" }),
  baseDetailsFields({ content_item_id: NOAA_52MIN_ID, duration_seconds: 3149, attribution: "NOAA National Ocean Service" }),
  baseDetailsFields({ content_item_id: EXTERNAL_B1_ID, duration_seconds: 320, attribution: "Voice of America" }),
];

describe("MIN_CATALOG_DURATION_SECONDS / MAX_CATALOG_DURATION_SECONDS", () => {
  it("are exported so other modules (src/lib/planning/content-selector.ts) can import the single real duration rule instead of hardcoding a second 300/360 copy", () => {
    expect(MIN_CATALOG_DURATION_SECONDS).toBe(300);
    expect(MAX_CATALOG_DURATION_SECONDS).toBe(360);
  });
});

describe("getPublishedPodcasts — LinguABC learning-catalog duration rule", () => {
  it("excludes the 16-minute NOAA episode (962s)", async () => {
    const result = await getPublishedPodcasts(fakeSupabase(ITEMS, DETAILS));
    expect(result.some((p) => p.id === NOAA_16MIN_ID)).toBe(false);
  });

  it("excludes the 52.5-minute NOAA episode (3149s)", async () => {
    const result = await getPublishedPodcasts(fakeSupabase(ITEMS, DETAILS));
    expect(result.some((p) => p.id === NOAA_52MIN_ID)).toBe(false);
  });

  it("excludes any podcast over 360 seconds generically, not just the two known NOAA ones", async () => {
    const items = [baseItemFields({ id: "podcast-long-generic" })];
    const details = [baseDetailsFields({ content_item_id: "podcast-long-generic", duration_seconds: 361, attribution: "Voice of America" })];
    const result = await getPublishedPodcasts(fakeSupabase(items, details));
    expect(result).toHaveLength(0);
  });

  it("includes a valid LinguABC B2/C1/C2 podcast within the duration range", async () => {
    const result = await getPublishedPodcasts(fakeSupabase(ITEMS, DETAILS));
    expect(result.some((p) => p.id === LINGUABC_ID)).toBe(true);
  });

  it("includes a valid approved external B1 podcast that meets the duration requirement", async () => {
    const result = await getPublishedPodcasts(fakeSupabase(ITEMS, DETAILS));
    expect(result.some((p) => p.id === EXTERNAL_B1_ID)).toBe(true);
  });

  it("accepts durations exactly at the 300s and 360s boundaries", async () => {
    const items = [baseItemFields({ id: "p-min" }), baseItemFields({ id: "p-max" })];
    const details = [
      baseDetailsFields({ content_item_id: "p-min", duration_seconds: 300, attribution: "LinguABC" }),
      baseDetailsFields({ content_item_id: "p-max", duration_seconds: 360, attribution: "LinguABC" }),
    ];
    const result = await getPublishedPodcasts(fakeSupabase(items, details));
    expect(result.map((p) => p.id).sort()).toEqual(["p-max", "p-min"]);
  });

  it("rejects durations just outside the boundaries (299s, 361s)", async () => {
    const items = [baseItemFields({ id: "p-under" }), baseItemFields({ id: "p-over" })];
    const details = [
      baseDetailsFields({ content_item_id: "p-under", duration_seconds: 299, attribution: "LinguABC" }),
      baseDetailsFields({ content_item_id: "p-over", duration_seconds: 361, attribution: "LinguABC" }),
    ];
    const result = await getPublishedPodcasts(fakeSupabase(items, details));
    expect(result).toHaveLength(0);
  });

  it("passes real source attribution through unchanged, never defaulting to LinguABC", async () => {
    const result = await getPublishedPodcasts(fakeSupabase(ITEMS, DETAILS));
    const external = result.find((p) => p.id === EXTERNAL_B1_ID);
    const own = result.find((p) => p.id === LINGUABC_ID);
    expect(external?.attribution).toBe("Voice of America");
    expect(own?.attribution).toBe("LinguABC");
  });

  it("does not mutate/overwrite a null attribution into 'LinguABC'", async () => {
    const items = [baseItemFields({ id: "p-unattributed" })];
    const details = [baseDetailsFields({ content_item_id: "p-unattributed", duration_seconds: 330, attribution: null })];
    const result = await getPublishedPodcasts(fakeSupabase(items, details));
    expect(result[0]?.attribution).toBeNull();
  });
});

describe("getPodcastById — same duration rule applies to direct id lookups", () => {
  it("returns null for the 16-minute NOAA episode by direct id, same as an unpublished item", async () => {
    const result = await getPodcastById(fakeSupabase(ITEMS, DETAILS), NOAA_16MIN_ID);
    expect(result).toBeNull();
  });

  it("returns null for the 52.5-minute NOAA episode by direct id", async () => {
    const result = await getPodcastById(fakeSupabase(ITEMS, DETAILS), NOAA_52MIN_ID);
    expect(result).toBeNull();
  });

  it("still returns a valid in-range LinguABC episode by id", async () => {
    const result = await getPodcastById(fakeSupabase(ITEMS, DETAILS), LINGUABC_ID);
    expect(result?.id).toBe(LINGUABC_ID);
    expect(result?.attribution).toBe("LinguABC");
  });

  it("still returns a valid in-range external B1 episode by id", async () => {
    const result = await getPodcastById(fakeSupabase(ITEMS, DETAILS), EXTERNAL_B1_ID);
    expect(result?.id).toBe(EXTERNAL_B1_ID);
    expect(result?.attribution).toBe("Voice of America");
  });
});
