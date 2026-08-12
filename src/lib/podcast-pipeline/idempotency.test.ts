import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextEpisodeNumber, assertEpisodeNumberSafe, checkForOrphanedDraft } from "./idempotency";

/**
 * Security-audit regression tests. The finding: pipeline.ts trusted a
 * caller-supplied episodeNumber directly for the storage upload path
 * (upsert:true), so an unverified number could overwrite an existing
 * published episode's audio file. assertEpisodeNumberSafe() is the fix --
 * these tests prove it actually rejects the overwrite cases the audit
 * described, using the real current production shape (episodes #001,
 * #002, #005 exist; #003/#004 were deleted and are genuinely free slots).
 */

function fakeSupabase(existingAudioUrls: string[]): SupabaseClient {
  const rows = existingAudioUrls.map((audio_url) => ({ audio_url }));
  return {
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_column: string, _value: string) {
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

const PROD_SHAPE_URLS = [
  "https://x.supabase.co/storage/v1/object/public/linguabc-podcast-audio/episode-001/podcast.mp3",
  "https://x.supabase.co/storage/v1/object/public/linguabc-podcast-audio/episode-002/podcast.mp3",
  "https://x.supabase.co/storage/v1/object/public/linguabc-podcast-audio/episode-005/podcast.mp3",
];

describe("nextEpisodeNumber — max-based", () => {
  it("TEST 12: computes 6 as the next number after #001, #002, #005 exist (not 3, 4, or 5)", async () => {
    await expect(nextEpisodeNumber(fakeSupabase(PROD_SHAPE_URLS))).resolves.toBe(6);
  });

  it("returns 1 when no LinguABC episodes exist yet", async () => {
    await expect(nextEpisodeNumber(fakeSupabase([]))).resolves.toBe(1);
  });
});

describe("assertEpisodeNumberSafe — overwrite prevention", () => {
  it("TEST 1: rejects episodeNumber=1 -- refuses to overwrite episode-001", async () => {
    await expect(assertEpisodeNumberSafe(fakeSupabase(PROD_SHAPE_URLS), 1)).rejects.toThrow(/episode-001/);
  });

  it("TEST 2: rejects episodeNumber=5 -- refuses to overwrite episode-005", async () => {
    await expect(assertEpisodeNumberSafe(fakeSupabase(PROD_SHAPE_URLS), 5)).rejects.toThrow(/episode-005/);
  });

  it("TEST 3: rejects an arbitrary already-occupied existing slot (episode-002)", async () => {
    await expect(assertEpisodeNumberSafe(fakeSupabase(PROD_SHAPE_URLS), 2)).rejects.toThrow(/episode-002/);
  });

  it("accepts the true current next number (6)", async () => {
    await expect(assertEpisodeNumberSafe(fakeSupabase(PROD_SHAPE_URLS), 6)).resolves.toBeUndefined();
  });

  it("accepts a genuinely-unoccupied freed gap number (3) -- proven safe, not just asserted", async () => {
    // #003 was permanently deleted; nothing currently occupies that path.
    // This is the deliberate, narrow exception the design allows: an
    // independently-VERIFIED-empty slot cannot overwrite anything.
    await expect(assertEpisodeNumberSafe(fakeSupabase(PROD_SHAPE_URLS), 3)).resolves.toBeUndefined();
  });

  it("does not falsely match episode-1 against episode-10+ style paths (no accidental prefix collision)", async () => {
    const urls = ["https://x.supabase.co/.../linguabc-podcast-audio/episode-010/podcast.mp3"];
    // episodeNumber 1 must NOT be considered occupied just because "episode-010" contains "episode-01..."
    await expect(assertEpisodeNumberSafe(fakeSupabase(urls), 1)).resolves.toBeUndefined();
  });
});

/**
 * Security-audit finding (MEDIUM): a hard crash between the
 * podcast_details write and publishContentItem() leaves a permanently
 * orphaned draft with no automatic retry/cleanup, and nextEpisodeNumber()
 * silently advances past it forever. checkForOrphanedDraft() is the fix --
 * these tests prove it actually detects the stuck-draft case and stays
 * silent for the healthy (all-published) case, using a dedicated fake
 * that models the real two-query shape (podcast_details, then
 * content_items.select().in()), distinct from fakeSupabase() above.
 */
function fakeSupabaseForOrphanCheck(opts: {
  detailsRows: { content_item_id: string; audio_url: string }[];
  itemStatusById: Record<string, string>;
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === "podcast_details") {
        return {
          select(_columns: string) {
            return { eq: (_col: string, _val: string) => Promise.resolve({ data: opts.detailsRows, error: null }) };
          },
        };
      }
      if (table === "content_items") {
        return {
          select(_columns: string) {
            return {
              in: (_col: string, ids: string[]) =>
                Promise.resolve({ data: ids.map((id) => ({ id, status: opts.itemStatusById[id] })), error: null }),
            };
          },
        };
      }
      throw new Error(`fakeSupabaseForOrphanCheck: unexpected table '${table}'`);
    },
  } as unknown as SupabaseClient;
}

describe("checkForOrphanedDraft — hard-crash orphan detection", () => {
  it("reports no orphan when there are no LinguABC episodes at all", async () => {
    const client = fakeSupabaseForOrphanCheck({ detailsRows: [], itemStatusById: {} });
    await expect(checkForOrphanedDraft(client)).resolves.toEqual({ orphaned: false });
  });

  it("reports no orphan when every LinguABC episode is published", async () => {
    const client = fakeSupabaseForOrphanCheck({
      detailsRows: [
        { content_item_id: "podcast-a", audio_url: ".../episode-001/podcast.mp3" },
        { content_item_id: "podcast-b", audio_url: ".../episode-002/podcast.mp3" },
      ],
      itemStatusById: { "podcast-a": "published", "podcast-b": "published" },
    });
    await expect(checkForOrphanedDraft(client)).resolves.toEqual({ orphaned: false });
  });

  it("detects a stuck draft and reports its content_item_id and parsed episode number", async () => {
    const client = fakeSupabaseForOrphanCheck({
      detailsRows: [
        { content_item_id: "podcast-a", audio_url: ".../episode-001/podcast.mp3" },
        { content_item_id: "podcast-b", audio_url: ".../episode-006/podcast.mp3" },
      ],
      itemStatusById: { "podcast-a": "published", "podcast-b": "draft" },
    });
    await expect(checkForOrphanedDraft(client)).resolves.toEqual({
      orphaned: true,
      contentItemId: "podcast-b",
      episodeNumber: 6,
    });
  });

  it("still reports the orphan even when its audio_url doesn't match the episode-NNN pattern (episodeNumber omitted)", async () => {
    const client = fakeSupabaseForOrphanCheck({
      detailsRows: [{ content_item_id: "podcast-weird", audio_url: "not-a-standard-path.mp3" }],
      itemStatusById: { "podcast-weird": "draft" },
    });
    await expect(checkForOrphanedDraft(client)).resolves.toEqual({
      orphaned: true,
      contentItemId: "podcast-weird",
      episodeNumber: undefined,
    });
  });
});
