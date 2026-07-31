import { describe, it, expect } from "vitest";
import { mergePendingAndFetched } from "./pipeline";
import type { RawContentItem } from "./types";

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
