import { describe, it, expect } from "vitest";
import { mergePendingAndFetched, runIngestionPipeline } from "./pipeline";
import type { RawContentItem, ContentProvider } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

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
