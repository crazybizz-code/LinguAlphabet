import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { episodeAudioPath, deleteEpisodeAudio } from "./storage";
import { STORAGE_BUCKET } from "./config";

/**
 * M1 (orphan-cleanup) regression test: deleteEpisodeAudio() must always
 * derive its path from episodeAudioPath(episodeNumber) -- never accept or
 * touch an arbitrary/caller-provided path -- so cleanup can never remove
 * another episode's object.
 */

function fakeStorageClient() {
  const removedPaths: string[][] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          expect(bucket).toBe(STORAGE_BUCKET);
          removedPaths.push(paths);
          return { error: null };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, removedPaths };
}

describe("episodeAudioPath", () => {
  it("zero-pads to a fixed 3-digit convention", () => {
    expect(episodeAudioPath(1)).toBe("episode-001/podcast.mp3");
    expect(episodeAudioPath(6)).toBe("episode-006/podcast.mp3");
    expect(episodeAudioPath(42)).toBe("episode-042/podcast.mp3");
  });
});

describe("deleteEpisodeAudio", () => {
  it("removes exactly the one path derived from the given episode number, nothing else", async () => {
    const { client, removedPaths } = fakeStorageClient();
    await deleteEpisodeAudio(client, 6);
    expect(removedPaths).toEqual([["episode-006/podcast.mp3"]]);
  });

  it("throws (does not swallow) when the storage remove call fails", async () => {
    const client = {
      storage: { from: () => ({ remove: async () => ({ error: { message: "boom" } }) }) },
    } as unknown as SupabaseClient;
    await expect(deleteEpisodeAudio(client, 6)).rejects.toThrow(/failed to clean up/i);
  });

  it("never touches a different episode's path than the one it was called with", async () => {
    const { client, removedPaths } = fakeStorageClient();
    await deleteEpisodeAudio(client, 6);
    expect(removedPaths[0]).not.toContain("episode-001/podcast.mp3");
    expect(removedPaths[0]).not.toContain("episode-005/podcast.mp3");
  });
});
