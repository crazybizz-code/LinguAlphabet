import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { mergePendingAndFetched, runIngestionPipeline } from "./pipeline";
import { generateEnrichment } from "./ai-processing";
import type { RawContentItem, ContentProvider, ProviderDraft, EnrichmentResult } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

vi.mock("./ai-processing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai-processing")>();
  return { ...actual, generateEnrichment: vi.fn() };
});

function item(externalId: string, title = externalId): RawContentItem {
  return { externalId, title, body: "body text" };
}

describe("mergePendingAndFetched", () => {
  it("puts pending items first — the whole point is that they stop being overtaken", () => {
    const merged = mergePendingAndFetched([item("old-1"), item("old-2")], [item("new-1")]);
    expect(merged.map((i) => i.externalId)).toEqual(["old-1", "old-2", "new-1"]);
  });

  it("processes an item once when it is both pending and re-fetched, preferring the fresh copy", () => {
    const pending = [{ ...item("same"), title: "stale title" }];
    const fetched = [{ ...item("same"), title: "fresh title" }];

    const merged = mergePendingAndFetched(pending, fetched);

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("fresh title");
  });

  it("keeps pending items the provider no longer returns — the leak this fixes", () => {
    // The item fell out of the provider's newest-N window. Without replay
    // it would never be seen again.
    const merged = mergePendingAndFetched([item("dropped-from-feed")], [item("todays-article")]);
    expect(merged.map((i) => i.externalId)).toEqual(["dropped-from-feed", "todays-article"]);
  });

  it("dedupes repeated ids within the fetched batch", () => {
    const merged = mergePendingAndFetched([], [item("dup"), item("dup"), item("other")]);
    expect(merged.map((i) => i.externalId)).toEqual(["dup", "other"]);
  });

  it("is a no-op passthrough when there is no backlog — the steady state", () => {
    const fetched = [item("a"), item("b")];
    expect(mergePendingAndFetched([], fetched)).toEqual(fetched);
  });

  it("returns only pending when the provider fetched nothing", () => {
    expect(mergePendingAndFetched([item("a")], []).map((i) => i.externalId)).toEqual(["a"]);
  });

  it("handles both sides empty", () => {
    expect(mergePendingAndFetched([], [])).toEqual([]);
  });

  it("never returns duplicate externalIds", () => {
    const merged = mergePendingAndFetched([item("a"), item("b")], [item("b"), item("c"), item("c")]);
    const ids = merged.map((i) => i.externalId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

// ── maxItemsPerRun quota enforcement ─────────────────────────────────────

/**
 * Minimal Supabase mock for quota enforcement tests. Makes the raw upsert
 * intentionally fail so items enter the processing path (incrementing
 * newItemsProcessed) but exit as itemsRejected, keeping the mock simple.
 */
function makePipelineMock(alreadyProcessed: Set<string>) {
  return {
    from: (table: string) => {
      let externalId = "";
      let selectFields = "";
      let op = "";

      const resolve = (): { data: unknown; error: unknown } => {
        if (table === "content_ingestion_runs" && op === "insert") {
          return { data: { id: "run-1" }, error: null };
        }
        if (table === "content_ingestion_runs") {
          return { data: null, error: null };
        }
        if (table === "content_raw_items" && selectFields.includes("normalized_item")) {
          // loadReplayableItems — no retry backlog
          return { data: [], error: null };
        }
        if (table === "content_raw_items" && selectFields.includes("processed_at")) {
          // per-item dedup check
          return alreadyProcessed.has(externalId)
            ? { data: { id: `raw-${externalId}`, processed_at: "2024-01-01T00:00:00Z" }, error: null }
            : { data: null, error: null };
        }
        if (table === "content_raw_items" && op === "upsert") {
          // intentional failure — item enters path (newItemsProcessed++) then lands in itemsRejected
          return { data: null, error: { message: "test-stop-at-upsert" } };
        }
        return { data: null, error: null };
      };

      const b: Record<string, (...args: unknown[]) => unknown> = {
        select: (f: unknown = "*") => { if (!op) op = "select"; selectFields = String(f); return b; },
        insert: () => { op = "insert"; return b; },
        upsert: () => { op = "upsert"; return b; },
        update: () => { op = "update"; return b; },
        eq: (col: unknown, val: unknown) => { if (col === "external_id") externalId = String(val); return b; },
        neq: () => b,
        not: () => b,
        is: () => b,
        gte: () => b,
        order: () => b,
        limit: () => b,
        single: () => Promise.resolve(resolve()),
        maybeSingle: () => Promise.resolve(resolve()),
        then: (...args: unknown[]) =>
          Promise.resolve(resolve()).then(args[0] as (r: unknown) => unknown, args[1] as ((e: unknown) => unknown) | undefined),
      };
      return b;
    },
  };
}

function makeProvider(items: RawContentItem[]): ContentProvider {
  return { id: "test", contentType: "article", fetchRawItems: async () => items };
}

function testItem(externalId: string): RawContentItem {
  return { externalId, title: externalId, body: "body text" };
}

describe("runIngestionPipeline: maxItemsPerRun quota enforcement", () => {
  it("already-processed items do not consume the processing quota", async () => {
    // [processed, new1, new2] + maxItemsPerRun=1 → new1 attempted, new2 never touched
    const mock = makePipelineMock(new Set(["processed"]));
    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      makeProvider([testItem("processed"), testItem("new1"), testItem("new2")]),
      {
        sourceId: "src",
        sourceConfig: { maxItemsPerRun: 1 },
        normalize: () => { throw new Error("normalize should not be called in this path"); },
      },
    );
    expect(result.status).toBe("completed");
    expect(result.itemsFetched).toBe(3); // all three returned by provider
    expect(result.itemsRejected).toBe(1); // only new1 attempted (fails at upsert)
    expect(result.itemsPublished).toBe(0);
  });

  it("stops after N new items even when earlier items are already processed", async () => {
    // [p1, p2, new1, new2, new3] + maxItemsPerRun=2 → new1 and new2 attempted, new3 not
    const mock = makePipelineMock(new Set(["p1", "p2"]));
    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      makeProvider([testItem("p1"), testItem("p2"), testItem("new1"), testItem("new2"), testItem("new3")]),
      {
        sourceId: "src",
        sourceConfig: { maxItemsPerRun: 2 },
        normalize: () => { throw new Error("normalize should not be called in this path"); },
      },
    );
    expect(result.status).toBe("completed");
    expect(result.itemsFetched).toBe(5);
    expect(result.itemsRejected).toBe(2); // new1 and new2 only; new3 skipped by break
    expect(result.itemsPublished).toBe(0);
  });

  it("processes all new items when maxItemsPerRun is absent", async () => {
    const mock = makePipelineMock(new Set());
    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      makeProvider([testItem("a"), testItem("b"), testItem("c")]),
      {
        sourceId: "src",
        sourceConfig: {}, // no cap
        normalize: () => { throw new Error("normalize should not be called in this path"); },
      },
    );
    expect(result.status).toBe("completed");
    expect(result.itemsRejected).toBe(3); // all three attempted, all fail at upsert
  });
});

// ── maxDurationSeconds — pre-ASR duration cap ────────────────────────────────

describe("runIngestionPipeline: maxDurationSeconds pre-ASR rejection", () => {
  it("rejects podcast items whose duration exceeds maxDurationSeconds WITHOUT calling the transcriber", async () => {
    let transcribeCalled = false;

    const mock = makePipelineMock(new Set());
    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      {
        id: "ac",
        contentType: "podcast",
        fetchRawItems: async () => [
          {
            externalId: "ep-long",
            title: "Very Long Episode",
            body: "",
            audio: { url: "https://traffic.libsyn.com/astronomycast/long.mp3", durationSeconds: 9999 },
            transcriptRef: { kind: "asr" as const, audioUrl: "https://traffic.libsyn.com/astronomycast/long.mp3" },
            transcriptProvenance: "generated_asr" as const,
            licence: "cc-by-4.0",
            attribution: "Astronomy Cast",
          },
        ],
      },
      {
        sourceId: "src-ac",
        sourceConfig: { maxDurationSeconds: 500 },
        normalize: () => { throw new Error("normalize must not be called for a duration-rejected item"); },
        resolveTranscript: async () => { transcribeCalled = true; return null; },
      },
    );

    // The item is rejected by the duration cap — itemsRejected is incremented,
    // itemsPublished stays zero, and the transcriber is never invoked.
    expect(result.itemsRejected).toBe(1);
    expect(result.itemsPublished).toBe(0);
    expect(transcribeCalled).toBe(false);
    expect(result.status).toBe("completed");
  });

  it("allows an episode exactly at the duration limit through to transcript resolution", async () => {
    let transcribeCalled = false;

    const mock = makePipelineMock(new Set());
    await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      {
        id: "ac",
        contentType: "podcast",
        fetchRawItems: async () => [
          {
            externalId: "ep-ok",
            title: "Episode At Limit",
            body: "",
            audio: { url: "https://traffic.libsyn.com/astronomycast/ok.mp3", durationSeconds: 500 },
            transcriptRef: { kind: "asr" as const, audioUrl: "https://traffic.libsyn.com/astronomycast/ok.mp3" },
            transcriptProvenance: "generated_asr" as const,
            licence: "cc-by-4.0",
            attribution: "Astronomy Cast",
          },
        ],
      },
      {
        sourceId: "src-ac",
        sourceConfig: { maxDurationSeconds: 500 },
        normalize: () => { throw new Error("normalize must not be called when upsert fails"); },
        resolveTranscript: async () => { transcribeCalled = true; return null; },
      },
    );

    // The item is at or under the limit — duration cap does not reject it,
    // so transcript resolution IS called (returns null → rejected there).
    expect(transcribeCalled).toBe(true);
  });

  it("applies the DEFAULT_MAX_DURATION_SECONDS (2100s) when maxDurationSeconds is absent from sourceConfig", async () => {
    let transcribeCalled = false;

    const mock = makePipelineMock(new Set());
    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      {
        id: "ac",
        contentType: "podcast",
        fetchRawItems: async () => [
          {
            externalId: "ep-over-default",
            title: "Episode Over Default Limit",
            body: "",
            audio: { url: "https://traffic.libsyn.com/astronomycast/long.mp3", durationSeconds: 2101 },
            transcriptRef: { kind: "asr" as const, audioUrl: "https://traffic.libsyn.com/astronomycast/long.mp3" },
            transcriptProvenance: "generated_asr" as const,
            licence: "cc-by-4.0",
            attribution: "Astronomy Cast",
          },
        ],
      },
      {
        sourceId: "src-ac",
        sourceConfig: {}, // no maxDurationSeconds → default 2100 applies
        normalize: () => { throw new Error("normalize must not be called for a duration-rejected item"); },
        resolveTranscript: async () => { transcribeCalled = true; return null; },
      },
    );

    expect(result.itemsRejected).toBe(1);
    expect(transcribeCalled).toBe(false);
  });

  it("does NOT apply the duration cap to article items (no resolveTranscript, no audio)", async () => {
    const mock = makePipelineMock(new Set());
    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      makeProvider([testItem("article-1"), testItem("article-2")]),
      {
        sourceId: "src",
        sourceConfig: { maxDurationSeconds: 1 }, // absurdly small — must NOT affect articles
        normalize: () => { throw new Error("normalize should not be called in this path"); },
        // resolveTranscript absent — article provider path
      },
    );

    // Both items reach the raw upsert (fail there with the mock). The
    // duration cap never fired because articles have no `raw.audio`.
    expect(result.itemsRejected).toBe(2);
  });
});

// ── autoPublish behavior ─────────────────────────────────────────────────────

/**
 * Full-path mock — succeeds at every DB operation so the pipeline can run
 * all the way through to upsertContentItem + publishContentItem. Captures
 * what status was written to content_items so tests can assert on it.
 */
interface FullMockCaptures {
  /** One entry per upsertContentItem call — contains the full row including `status`. */
  contentItemUpserts: Array<Record<string, unknown>>;
  /** One entry per publishContentItem call (content_items UPDATE). */
  contentItemUpdates: Array<Record<string, unknown>>;
}

function makeFullPipelineMock(): { from: (table: string) => unknown; captures: FullMockCaptures } {
  const captures: FullMockCaptures = { contentItemUpserts: [], contentItemUpdates: [] };

  return {
    captures,
    from: (table: string) => {
      let op = "";
      let selectFields = "";
      let rowData: unknown = null;

      function resolve(): { data: unknown; error: unknown } {
        if (table === "content_ingestion_runs") {
          return op === "insert"
            ? { data: { id: "run-1" }, error: null }
            : { data: null, error: null };
        }
        if (table === "content_raw_items") {
          if (selectFields.includes("normalized_item")) return { data: [], error: null };
          if (selectFields.includes("processed_at")) return { data: null, error: null };
          if (op === "upsert") return { data: { id: "raw-1", source_id: "src", external_id: "ep-1" }, error: null };
          return { data: null, error: null };
        }
        if (table === "content_items") {
          if (op === "upsert") {
            captures.contentItemUpserts.push(rowData as Record<string, unknown>);
            return { data: null, error: null };
          }
          if (op === "update") {
            captures.contentItemUpdates.push(rowData as Record<string, unknown>);
            return { data: null, error: null };
          }
          return { data: null, error: null };
        }
        // podcast_details and any other table
        return { data: null, error: null };
      }

      const b: Record<string, (...args: unknown[]) => unknown> = {
        select: (f: unknown = "*") => { selectFields = String(f); return b; },
        insert: (d: unknown) => { op = "insert"; rowData = d; return b; },
        upsert: (d: unknown) => { op = "upsert"; rowData = d; return b; },
        update: (d: unknown) => { op = "update"; rowData = d; return b; },
        eq: () => b,
        neq: () => b,
        not: () => b,
        is: () => b,
        gte: () => b,
        lte: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => Promise.resolve(resolve()),
        single: () => Promise.resolve(resolve()),
        then: (...args: unknown[]) =>
          Promise.resolve(resolve()).then(
            args[0] as (r: unknown) => unknown,
            args[1] as ((e: unknown) => unknown) | undefined,
          ),
      };
      return b;
    },
  };
}

const fakeEnrichment: EnrichmentResult = {
  cefrLevelMin: "B1",
  cefrLevelMax: "B2",
  topics: [],
  rawTopics: [],
  summary: "A concise summary of the episode.",
  vocabulary: [],
  quiz: [],
  takeaways: ["Key takeaway."],
  reflection: "Reflect on this episode.",
  keyExpressions: [],
  discussionQuestions: [],
  listeningNotes: ["Listen for pacing."],
  grammarNotes: [],
  readingDifficulty: null,
};

function makePodcastProvider(items: RawContentItem[]): ContentProvider {
  return { id: "voa", contentType: "podcast", fetchRawItems: async () => items };
}

function fakePodcastItem(externalId = "ep-1"): RawContentItem {
  return {
    externalId,
    title: "Test Episode",
    body: "Hello world. This is the episode transcript.",
    audio: { url: "https://voanews.com/audio.mp3", durationSeconds: 600 },
  };
}

function makePodcastDraft(detailsOverride?: Record<string, unknown>): ProviderDraft {
  return {
    id: "pod-test-id",
    contentType: "podcast",
    title: "Test Episode",
    description: "A test episode description.",
    skills: ["Listening"],
    goalAlignment: [],
    tags: [],
    thumbnailUrl: "",
    detailsTable: "podcast_details",
    detailsRow: {
      audio_url: "https://voanews.com/audio.mp3",
      duration_seconds: 600,
      transcript: [{ speaker: "Host", text: "Hello world.", startMs: 0, endMs: 1000 }],
      source_url: "",
      licence: "",
      attribution: "",
      transcript_provenance: "operator",
      transcript_hash: null,
      ...detailsOverride,
    },
  };
}

describe("runIngestionPipeline: autoPublish behavior", () => {
  beforeEach(() => {
    process.env.AI_ENRICHMENT_PACING_MS = "0";
    vi.resetAllMocks();
  });

  afterEach(() => {
    delete process.env.AI_ENRICHMENT_PACING_MS;
  });

  it("autoPublish: true → content_items written as 'published', publishContentItem called", async () => {
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment);
    const mock = makeFullPipelineMock();

    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      makePodcastProvider([fakePodcastItem()]),
      { sourceId: "src", sourceConfig: {}, autoPublish: true, normalize: () => makePodcastDraft() },
    );

    expect(result.itemsPublished).toBe(1);
    expect(result.itemsRejected).toBe(0);
    // upsertContentItem wrote status: "published"
    expect(mock.captures.contentItemUpserts).toHaveLength(1);
    expect(mock.captures.contentItemUpserts[0]).toMatchObject({ status: "published" });
    // publishContentItem fired the UPDATE
    expect(mock.captures.contentItemUpdates).toHaveLength(1);
    expect(mock.captures.contentItemUpdates[0]).toMatchObject({ status: "published" });
  });

  it("autoPublish: false → content_items written as 'draft', publishContentItem NOT called", async () => {
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment);
    const mock = makeFullPipelineMock();

    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      makePodcastProvider([fakePodcastItem()]),
      { sourceId: "src", sourceConfig: {}, autoPublish: false, normalize: () => makePodcastDraft() },
    );

    expect(result.itemsPublished).toBe(1);
    expect(mock.captures.contentItemUpserts).toHaveLength(1);
    expect(mock.captures.contentItemUpserts[0]).toMatchObject({ status: "draft" });
    // publishContentItem must NOT have been called
    expect(mock.captures.contentItemUpdates).toHaveLength(0);
  });

  it("quality gate failure → content_items not written regardless of autoPublish", async () => {
    vi.mocked(generateEnrichment).mockResolvedValue(fakeEnrichment);
    const mock = makeFullPipelineMock();

    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      makePodcastProvider([fakePodcastItem()]),
      {
        sourceId: "src",
        sourceConfig: {},
        autoPublish: true,
        // empty transcript → quality gate rejects "Missing transcript"
        normalize: () => makePodcastDraft({ transcript: [] }),
      },
    );

    expect(result.itemsPublished).toBe(0);
    expect(result.itemsRejected).toBe(1);
    expect(mock.captures.contentItemUpserts).toHaveLength(0);
    expect(mock.captures.contentItemUpdates).toHaveLength(0);
  });

  it("enrichment failure → content_items not written", async () => {
    vi.mocked(generateEnrichment).mockRejectedValue(new Error("AI service unavailable"));
    const mock = makeFullPipelineMock();

    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      makePodcastProvider([fakePodcastItem()]),
      { sourceId: "src", sourceConfig: {}, autoPublish: true, normalize: () => makePodcastDraft() },
    );

    expect(result.itemsPublished).toBe(0);
    expect(result.itemsRejected).toBe(1);
    expect(mock.captures.contentItemUpserts).toHaveLength(0);
    expect(mock.captures.contentItemUpdates).toHaveLength(0);
  });

  it("transcript resolution failure → content_items not written, enrichment never called", async () => {
    const mock = makeFullPipelineMock();

    const result = await runIngestionPipeline(
      mock as unknown as SupabaseClient<Database>,
      makePodcastProvider([fakePodcastItem()]),
      {
        sourceId: "src",
        sourceConfig: {},
        autoPublish: true,
        normalize: () => makePodcastDraft(),
        resolveTranscript: () => Promise.resolve(null),
      },
    );

    expect(result.itemsPublished).toBe(0);
    expect(result.itemsRejected).toBe(1);
    expect(vi.mocked(generateEnrichment)).not.toHaveBeenCalled();
    expect(mock.captures.contentItemUpserts).toHaveLength(0);
    expect(mock.captures.contentItemUpdates).toHaveLength(0);
  });
});
