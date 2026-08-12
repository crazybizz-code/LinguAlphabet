import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestPodcastEpisode } from "./podcast-ingestion";
import type { EnrichmentResult } from "./types";

/**
 * Security-audit regression tests for the atomic-publish-sequence fix
 * (C1) and the vocabulary/quiz quality-gate fix (H1), together -- proving
 * the actual write SEQUENCE and CONTENT, not just the final outcome.
 *
 * Before the fix: content_items was upserted with status="published"
 * FIRST, then podcast_details as a separate call. A failure in the
 * second call left a live, broken "published" episode. After the fix:
 * content_items is always upserted as "draft" first; only a SEPARATE
 * publishContentItem() call (after podcast_details succeeds) ever sets
 * status="published".
 */

interface Call {
  table: string;
  op: "upsert" | "update";
  payload: Record<string, unknown>;
}

function fakeSupabase(opts: { failTable?: string } = {}): { client: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];

  function tableHandle(table: string) {
    return {
      // Duplicate-by-transcript-hash check -- always "no duplicate found".
      select(_columns: string) {
        return {
          eq(_col: string, _val: string) {
            return {
              neq(_col2: string, _val2: string) {
                return {
                  limit(_n: number) {
                    return { maybeSingle: async () => ({ data: null, error: null }) };
                  },
                };
              },
            };
          },
        };
      },
      upsert: async (row: Record<string, unknown>, _options?: unknown) => {
        calls.push({ table, op: "upsert", payload: row });
        if (opts.failTable === table) return { error: { message: `simulated failure writing ${table}` } };
        return { error: null };
      },
      update(row: Record<string, unknown>) {
        calls.push({ table, op: "update", payload: row });
        return {
          eq: async (_col: string, _val: string) => {
            if (opts.failTable === table) return { error: { message: "simulated failure" } };
            return { error: null };
          },
        };
      },
    };
  }

  return { client: { from: (table: string) => tableHandle(table) } as unknown as SupabaseClient, calls };
}

const DURATION_SECONDS = 320;
// verifyTranscript's duration-consistency check wants ~150 wpm; targeting
// that ratio directly avoids fragile hand-counted word totals.
const TARGET_WORDS = Math.round((DURATION_SECONDS / 60) * 150);

function transcriptInput(): string {
  const filler = Array.from({ length: TARGET_WORDS - 12 }, () => "weather").join(" ");
  const segments = [
    { speaker: "Sarah", text: `Welcome to the show, today we talk about the weather. ${filler}` },
    { speaker: "Hannah", text: "Thanks for listening, see you next time." },
  ];
  return JSON.stringify(segments);
}

function validEnrichment(overrides: Partial<EnrichmentResult> = {}): EnrichmentResult {
  return {
    // BASE_INPUT.attribution is "LinguABC" -- policy requires B2/C1/C2 for
    // LinguABC-attributed podcasts (publishing.ts's quality gate), so this
    // fixture must reflect a policy-compliant episode by default.
    cefrLevelMin: "B2",
    cefrLevelMax: "B2",
    topics: [],
    rawTopics: ["Culture"],
    summary: "A summary about the weather.",
    vocabulary: [{ word: "weather", phonetic: "", pos: "noun", translation: "", definition: "Atmospheric conditions.", example: "The weather is nice today." }],
    quiz: [{ type: "mc", question: "What do they talk about?", options: ["Weather", "Sports", "Food", "Music"], correct: 0, explanation: "It's in the title.", grammarTopic: null, vocabularyWord: null }],
    takeaways: ["People talk about the weather often."],
    reflection: "Do you talk about the weather?",
    keyExpressions: [],
    discussionQuestions: ["Why do people discuss the weather?"],
    listeningNotes: ["Listen for casual small-talk phrasing."],
    grammarNotes: [],
    readingDifficulty: null,
    ...overrides,
  };
}

const BASE_INPUT = {
  externalId: "linguabc-episode-999",
  title: "Why We Talk About The Weather",
  audioUrl: "https://jwwhmzrisrauayyadwxb.supabase.co/storage/v1/object/public/linguabc-podcast-audio/episode-999/podcast.mp3",
  durationSeconds: DURATION_SECONDS,
  licence: "Original LinguABC content",
  attribution: "LinguABC",
  transcriptProvenance: "operator" as const,
};

describe("ingestPodcastEpisode — atomic publish sequence (C1) + vocabulary/quiz gate (H1)", () => {
  // ingestPodcastEpisode's step 2b (audio.ts's isReachableAudio) makes a
  // real HEAD request against input.audioUrl before continuing. Stub the
  // global fetch so these tests exercise the publish-sequence/quality-gate
  // logic under test, not real network reachability of a fake URL.
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200, headers: { "content-type": "audio/mpeg" } })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("details write succeeds -> content_items written draft-first, THEN published (never published-first)", async () => {
    const { client, calls } = fakeSupabase();

    const outcome = await ingestPodcastEpisode(
      client,
      BASE_INPUT,
      { transcriptInput: transcriptInput(), enrichmentOverride: validEnrichment(), autoPublish: true },
    );

    expect(outcome.status).toBe("published");

    const contentItemsCalls = calls.filter((c) => c.table === "content_items");
    expect(contentItemsCalls[0].op).toBe("upsert");
    expect(contentItemsCalls[0].payload.status).toBe("draft");

    const detailsCallIndex = calls.findIndex((c) => c.table === "podcast_details");
    const publishCallIndex = calls.findIndex((c) => c.table === "content_items" && c.op === "update");
    expect(detailsCallIndex).toBeGreaterThan(-1);
    expect(publishCallIndex).toBeGreaterThan(detailsCallIndex);
    expect(calls[publishCallIndex].payload.status).toBe("published");
  });

  it("TEST 8: podcast_details write fails -> content_items is NEVER left published, no orphan published row", async () => {
    const { client, calls } = fakeSupabase({ failTable: "podcast_details" });

    const outcome = await ingestPodcastEpisode(
      client,
      BASE_INPUT,
      { transcriptInput: transcriptInput(), enrichmentOverride: validEnrichment(), autoPublish: true },
    );

    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") expect(outcome.stage).toBe("storage");

    // content_items WAS written, but only ever as draft -- never published.
    const contentItemsUpsert = calls.find((c) => c.table === "content_items" && c.op === "upsert");
    expect(contentItemsUpsert?.payload.status).toBe("draft");

    // publishContentItem's update() must never have been reached.
    const publishCall = calls.find((c) => c.table === "content_items" && c.op === "update");
    expect(publishCall).toBeUndefined();
  });

  it("TEST 6: vocabulary=[] is rejected by the quality gate BEFORE any database write", async () => {
    const { client, calls } = fakeSupabase();

    const outcome = await ingestPodcastEpisode(
      client,
      BASE_INPUT,
      { transcriptInput: transcriptInput(), enrichmentOverride: validEnrichment({ vocabulary: [] }), autoPublish: true },
    );

    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.stage).toBe("quality_gate");
      expect(outcome.reasons).toContain("Missing vocabulary");
    }
    expect(calls).toHaveLength(0); // zero writes -- blocked pre-publish, not just detected after.
  });

  it("TEST 7: quiz=[] is rejected by the quality gate BEFORE any database write", async () => {
    const { client, calls } = fakeSupabase();

    const outcome = await ingestPodcastEpisode(
      client,
      BASE_INPUT,
      { transcriptInput: transcriptInput(), enrichmentOverride: validEnrichment({ quiz: [] }), autoPublish: true },
    );

    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.stage).toBe("quality_gate");
      expect(outcome.reasons).toContain("Missing quiz");
    }
    expect(calls).toHaveLength(0);
  });

  it("LinguABC podcast policy: a B1-range enrichment is rejected by the quality gate BEFORE any database write", async () => {
    const { client, calls } = fakeSupabase();

    const outcome = await ingestPodcastEpisode(
      client,
      BASE_INPUT,
      { transcriptInput: transcriptInput(), enrichmentOverride: validEnrichment({ cefrLevelMin: "B1", cefrLevelMax: "B1" }), autoPublish: true },
    );

    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.stage).toBe("quality_gate");
      expect(outcome.reasons.some((r) => /must be B2, C1, or C2/.test(r))).toBe(true);
    }
    expect(calls).toHaveLength(0);
  });
});
