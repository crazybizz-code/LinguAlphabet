import { describe, it, expect } from "vitest";
import { chooseCefrLevelForEpisode, isApprovedLinguAbcCefrLevel, LINGUABC_CEFR_LEVELS } from "./cefrLevel";

/**
 * LinguABC AI-generated podcast level policy: B2/C1/C2 only, rotated by
 * episode number the same way voiceRotation.ts rotates voice pairs. B1 is
 * reserved for external content and must never be selectable here.
 */
describe("chooseCefrLevelForEpisode", () => {
  it("cycles deterministically: B2, C1, C2, then repeats", () => {
    expect(chooseCefrLevelForEpisode(1)).toBe("B2");
    expect(chooseCefrLevelForEpisode(2)).toBe("C1");
    expect(chooseCefrLevelForEpisode(3)).toBe("C2");
    expect(chooseCefrLevelForEpisode(4)).toBe("B2");
  });

  it("episode #006 (the true next production episode) resolves to C2", () => {
    // (6-1) % 3 === 2 -> C2, per the deterministic sequence above.
    expect(chooseCefrLevelForEpisode(6)).toBe("C2");
  });

  it("never selects B1 or any level outside B2/C1/C2, across many episode numbers", () => {
    for (let episodeNumber = 1; episodeNumber <= 30; episodeNumber++) {
      expect(LINGUABC_CEFR_LEVELS).toContain(chooseCefrLevelForEpisode(episodeNumber));
    }
  });
});

describe("isApprovedLinguAbcCefrLevel", () => {
  it("accepts B2, C1, C2", () => {
    expect(isApprovedLinguAbcCefrLevel("B2")).toBe(true);
    expect(isApprovedLinguAbcCefrLevel("C1")).toBe(true);
    expect(isApprovedLinguAbcCefrLevel("C2")).toBe(true);
  });

  it("rejects B1 and any other value", () => {
    expect(isApprovedLinguAbcCefrLevel("B1")).toBe(false);
    expect(isApprovedLinguAbcCefrLevel("A1")).toBe(false);
    expect(isApprovedLinguAbcCefrLevel("not-a-level")).toBe(false);
    expect(isApprovedLinguAbcCefrLevel(undefined)).toBe(false);
  });
});
