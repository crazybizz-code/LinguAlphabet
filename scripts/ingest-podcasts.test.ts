/**
 * Unit tests for the podcast ingestion runner.
 *
 * All tests use injected stub objects — no real Supabase, no network, no
 * ASR subprocess, no AI provider. The supabase stub is shaped to fail the
 * pipeline's very first write (content_ingestion_runs INSERT) so that
 * any source that reaches runIngestionPipeline terminates immediately as
 * "failed" — which is the assertion that proves the source was NOT skipped.
 */
import { vi, describe, it, expect, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { Transcriber } from "@/lib/content-engine/transcripts/asr";
import type { IngestionRunResult } from "@/lib/content-engine";
import { contentEngine } from "@/lib/content-engine";
import { runPodcastIngestion } from "./ingest-podcasts";

/** Never called — podcast sources fail before ASR in tests. */
const noOpTranscriber: Transcriber = async () => null;

type SourceRow = {
  id: string;
  name: string;
  provider_id: string;
  config: Record<string, unknown>;
  enabled: boolean;
};

/**
 * Builds a minimal stub that satisfies the two layers of Supabase queries:
 *
 * 1. The runner's own SELECT on content_sources — returns `sources`.
 * 2. Everything else (pipeline writes) — resolves to an error so the
 *    pipeline throws on its very first INSERT without making any network
 *    call or further Supabase request.
 */
function stubSupabase(sources: SourceRow[]): SupabaseClient<Database> {
  const pipelineError = { message: "test stub: pipeline writes not implemented" };

  // A chainable object that always resolves to `result`. Every builder
  // method returns itself so any chain — however deep — terminates with
  // either `.single()` (which returns the bare promise) or a direct await
  // (which calls `.then` on the object).
  function failChain(): Record<string, unknown> {
    const result = Promise.resolve({ data: null, error: pipelineError });
    const obj: Record<string, unknown> = {};
    for (const method of [
      "select",
      "insert",
      "update",
      "upsert",
      "delete",
      "eq",
      "neq",
      "is",
      "not",
      "filter",
      "in",
      "lt",
      "gt",
      "gte",
      "lte",
      "order",
      "limit",
    ]) {
      obj[method] = () => failChain();
    }
    // single() terminates the chain with the promise directly
    obj["single"] = () => result;
    // Make the builder itself awaitable
    obj["then"] = result.then.bind(result);
    obj["catch"] = result.catch.bind(result);
    return obj;
  }

  return {
    from: (table: string) => {
      if (table === "content_sources") {
        // The runner's own query: .from("content_sources").select("*").eq("enabled", true)
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: sources, error: null }),
          }),
        };
      }
      // All other tables hit the pipeline — fail immediately so no real
      // DB writes or provider network calls occur.
      return failChain();
    },
  } as unknown as SupabaseClient<Database>;
}

describe("runPodcastIngestion — source filtering", () => {
  it("returns no runs when there are no enabled sources", async () => {
    const { runs, anyFailed } = await runPodcastIngestion(stubSupabase([]), noOpTranscriber);
    expect(runs).toHaveLength(0);
    expect(anyFailed).toBe(false);
  });

  it("skips a source whose provider_id is not registered in the engine", async () => {
    const { runs, anyFailed } = await runPodcastIngestion(
      stubSupabase([
        { id: "src-1", name: "Unknown Source", provider_id: "unknown-xyz", config: {}, enabled: true },
      ]),
      noOpTranscriber,
    );

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ sourceId: "src-1", status: "skipped" });
    expect((runs[0] as { reason: string }).reason).toMatch(/unregistered provider/i);
    // An unregistered provider is not a failure — it's a configuration gap
    expect(anyFailed).toBe(false);
  });

  it("skips an RSS article source — Vercel cron handles those", async () => {
    const { runs, anyFailed } = await runPodcastIngestion(
      stubSupabase([
        { id: "src-rss", name: "RSS Feed", provider_id: "rss", config: { feedUrl: "https://example.com/feed" }, enabled: true },
      ]),
      noOpTranscriber,
    );

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ sourceId: "src-rss", status: "skipped" });
    expect((runs[0] as { reason: string }).reason).toMatch(/not a podcast source/i);
    expect(anyFailed).toBe(false);
  });

  it("skips the PLOS article source", async () => {
    const { runs, anyFailed } = await runPodcastIngestion(
      stubSupabase([
        { id: "src-plos", name: "PLOS ONE", provider_id: "plos", config: {}, enabled: true },
      ]),
      noOpTranscriber,
    );

    expect(runs[0]).toMatchObject({ sourceId: "src-plos", status: "skipped" });
    expect((runs[0] as { reason: string }).reason).toMatch(/not a podcast source/i);
    expect(anyFailed).toBe(false);
  });

  it("skips The Conversation article source", async () => {
    const { runs } = await runPodcastIngestion(
      stubSupabase([
        { id: "src-tc", name: "The Conversation", provider_id: "the_conversation", config: {}, enabled: true },
      ]),
      noOpTranscriber,
    );

    expect(runs[0]).toMatchObject({ sourceId: "src-tc", status: "skipped" });
    expect((runs[0] as { reason: string }).reason).toMatch(/not a podcast source/i);
  });

  it("attempts the VOA podcast source — status is 'failed' (not 'skipped') proving it entered the pipeline", async () => {
    // The stub makes the pipeline's first DB write (content_ingestion_runs
    // INSERT) return an error, so the pipeline throws immediately. The
    // runner catches that throw and records status: "failed". The assertion
    // that status is "failed" and NOT "skipped" is what proves the source
    // passed through the podcast filter and entered the pipeline.
    //
    // No network calls are made: the pipeline throws before ever calling
    // provider.fetchRawItems().
    const { runs, anyFailed } = await runPodcastIngestion(
      stubSupabase([
        {
          id: "src-voa",
          name: "VOA Learning English",
          provider_id: "voa",
          config: { feedUrl: "https://learningenglish.voanews.com/podcast/2058.xml" },
          enabled: true,
        },
      ]),
      noOpTranscriber,
    );

    expect(runs).toHaveLength(1);
    // Must be "failed", never "skipped"
    expect(runs[0]).toMatchObject({ sourceId: "src-voa", status: "failed" });
    expect(anyFailed).toBe(true);
  });

  it("attempts the Astronomy Cast podcast source — status is 'failed' (not 'skipped') proving it entered the pipeline", async () => {
    // Same pattern as VOA and NOAA: the stub makes the pipeline's first DB
    // write return an error so the pipeline throws immediately. "failed"
    // proves the source passed the podcast filter and entered the pipeline;
    // "skipped" would mean the provider was not recognised or the content
    // type was wrong.
    const { runs, anyFailed } = await runPodcastIngestion(
      stubSupabase([
        {
          id: "src-ac",
          name: "Astronomy Cast",
          provider_id: "astronomy-cast",
          config: { feedUrl: "https://astronomycast.libsyn.com/rss" },
          enabled: true,
        },
      ]),
      noOpTranscriber,
    );

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ sourceId: "src-ac", status: "failed" });
    expect(anyFailed).toBe(true);
  });

  it("attempts the NOAA Ocean podcast source — status is 'failed' (not 'skipped') proving it entered the pipeline", async () => {
    // Same pattern as the VOA test: the stub makes the pipeline's first DB
    // write return an error, so the pipeline throws immediately. "failed"
    // proves the source passed the podcast filter and entered the pipeline;
    // "skipped" would mean the provider was not recognised or the content
    // type was wrong.
    const { runs, anyFailed } = await runPodcastIngestion(
      stubSupabase([
        {
          id: "src-noaa",
          name: "NOAA Ocean Podcast",
          provider_id: "noaa-ocean",
          config: { feedUrl: "https://oceanservice.noaa.gov/rss/noaa-ocean-podcast.xml" },
          enabled: true,
        },
      ]),
      noOpTranscriber,
    );

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ sourceId: "src-noaa", status: "failed" });
    expect(anyFailed).toBe(true);
  });

  it("handles a mix of article and podcast sources in one run", async () => {
    const { runs } = await runPodcastIngestion(
      stubSupabase([
        { id: "src-rss", name: "RSS", provider_id: "rss", config: { feedUrl: "https://example.com/feed" }, enabled: true },
        { id: "src-voa", name: "VOA", provider_id: "voa", config: { feedUrl: "https://learningenglish.voanews.com/podcast/2058.xml" }, enabled: true },
        { id: "src-unk", name: "Unknown", provider_id: "nonexistent", config: {}, enabled: true },
      ]),
      noOpTranscriber,
    );

    expect(runs).toHaveLength(3);

    const rss = runs.find((r) => r.sourceId === "src-rss");
    const voa = runs.find((r) => r.sourceId === "src-voa");
    const unk = runs.find((r) => r.sourceId === "src-unk");

    // Article sources skipped
    expect(rss).toMatchObject({ status: "skipped" });
    expect((rss as { reason: string }).reason).toMatch(/not a podcast source/i);

    // Podcast source attempted (failed in stub, not skipped)
    expect(voa).toMatchObject({ status: "failed" });

    // Unknown source skipped
    expect(unk).toMatchObject({ status: "skipped" });
    expect((unk as { reason: string }).reason).toMatch(/unregistered provider/i);
  });

  it("anyFailed is false when all sources are skipped", async () => {
    const { anyFailed } = await runPodcastIngestion(
      stubSupabase([
        { id: "src-rss", name: "RSS", provider_id: "rss", config: { feedUrl: "https://example.com/feed" }, enabled: true },
        { id: "src-unk", name: "Unknown", provider_id: "ghost", config: {}, enabled: true },
      ]),
      noOpTranscriber,
    );

    expect(anyFailed).toBe(false);
  });
});

describe("runPodcastIngestion — autoPublish", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes autoPublish: true to runIngestionPipeline for podcast sources", async () => {
    const completedRun: IngestionRunResult = {
      runId: "run-1",
      itemsFetched: 0,
      itemsRetried: 0,
      itemsPublished: 0,
      itemsRejected: 0,
      status: "completed",
    };
    const spy = vi.spyOn(contentEngine, "runIngestionPipeline").mockResolvedValue(completedRun);

    await runPodcastIngestion(
      stubSupabase([
        {
          id: "src-voa",
          name: "VOA",
          provider_id: "voa",
          config: { feedUrl: "https://learningenglish.voanews.com/podcast/2058.xml" },
          enabled: true,
        },
      ]),
      noOpTranscriber,
    );

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ contentType: "podcast" }),
      expect.objectContaining({ autoPublish: true }),
    );
  });
});
