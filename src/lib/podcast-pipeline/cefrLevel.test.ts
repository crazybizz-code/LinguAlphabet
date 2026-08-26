import { describe, it, expect } from "vitest";
import { chooseCefrLevelForEpisode, isApprovedLinguAbcCefrLevel, meetsOrExceedsLinguAbcCefrLevel, LINGUABC_CEFR_LEVELS, LINGUABC_ROTATION_CEFR_LEVELS } from "./cefrLevel";

/**
 * LinguABC AI-generated podcast level policy. Two separate lists, on
 * purpose: LINGUABC_CEFR_LEVELS is every level a script may legitimately
 * GRADE as (still B2/C1/C2), while LINGUABC_ROTATION_CEFR_LEVELS is what the
 * daily scheduler REQUESTS (B2/C1 only). B1 is reserved for external content
 * and must never be selectable by either.
 */
describe("chooseCefrLevelForEpisode", () => {
  it("cycles deterministically: B2, C1, then repeats", () => {
    expect(chooseCefrLevelForEpisode(1)).toBe("B2");
    expect(chooseCefrLevelForEpisode(2)).toBe("C1");
    expect(chooseCefrLevelForEpisode(3)).toBe("B2");
    expect(chooseCefrLevelForEpisode(4)).toBe("C1");
  });

  /**
   * C2 is unreachable, not merely hard: 8 controlled C2 generations through
   * the real prompt and real grader all returned B2-C1 (an enriched content
   * brief changed nothing), and the grader has never returned cefrLevelMax=C2
   * across 285 graded items. Requesting it guaranteed a failed day.
   */
  it("never selects C2 -- the scheduler must not request an unreachable level", () => {
    for (let episodeNumber = 1; episodeNumber <= 100; episodeNumber++) {
      expect(chooseCefrLevelForEpisode(episodeNumber)).not.toBe("C2");
    }
    expect(LINGUABC_ROTATION_CEFR_LEVELS).not.toContain("C2");
  });

  it("alternates strictly between B2 and C1 -- both levels stay in rotation", () => {
    const selected = new Set(Array.from({ length: 20 }, (_, i) => chooseCefrLevelForEpisode(i + 1)));
    expect([...selected].sort()).toEqual(["B2", "C1"]);
  });

  it("never selects B1 or any level outside the approved set, across many episode numbers", () => {
    for (let episodeNumber = 1; episodeNumber <= 30; episodeNumber++) {
      expect(LINGUABC_CEFR_LEVELS).toContain(chooseCefrLevelForEpisode(episodeNumber));
    }
  });

  /**
   * The grading side must be untouched by this scheduling change: C2 remains
   * a valid GRADE (isApprovedLinguAbcCefrLevel) and remains in the ordering
   * meetsOrExceedsLinguAbcCefrLevel() indexes into. Narrowing the shared list
   * instead of adding a rotation-only one would have broken both.
   */
  it("C2 is still an approved grade and still orders correctly, even though it is never requested", () => {
    expect(LINGUABC_CEFR_LEVELS).toContain("C2");
    expect(isApprovedLinguAbcCefrLevel("C2")).toBe(true);
    expect(meetsOrExceedsLinguAbcCefrLevel("C2", "C1")).toBe(true);
    expect(meetsOrExceedsLinguAbcCefrLevel("C2", "C2")).toBe(true);
    expect(meetsOrExceedsLinguAbcCefrLevel("C1", "C2")).toBe(false);
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

/**
 * Fix #14: a real GitHub Actions run requested C2 and the authoritative
 * grading came back cefrLevelMin=B1/cefrLevelMax=B2 -- already rejected by
 * isApprovedLinguAbcCefrLevel() alone. This function closes the separate,
 * real gap that check leaves open: a C2 request graded cefrLevelMin=B2
 * (an APPROVED level) would previously have silently passed, since nothing
 * ever compared the grade against what was actually requested.
 */
describe("meetsOrExceedsLinguAbcCefrLevel", () => {
  it("a level meets itself", () => {
    expect(meetsOrExceedsLinguAbcCefrLevel("B2", "B2")).toBe(true);
    expect(meetsOrExceedsLinguAbcCefrLevel("C1", "C1")).toBe(true);
    expect(meetsOrExceedsLinguAbcCefrLevel("C2", "C2")).toBe(true);
  });

  it("a higher level exceeds a lower minimum", () => {
    expect(meetsOrExceedsLinguAbcCefrLevel("C1", "B2")).toBe(true);
    expect(meetsOrExceedsLinguAbcCefrLevel("C2", "B2")).toBe(true);
    expect(meetsOrExceedsLinguAbcCefrLevel("C2", "C1")).toBe(true);
  });

  it("a lower level does not meet a higher minimum -- the exact real-world case this fix closes", () => {
    expect(meetsOrExceedsLinguAbcCefrLevel("B2", "C1")).toBe(false);
    expect(meetsOrExceedsLinguAbcCefrLevel("B2", "C2")).toBe(false);
    expect(meetsOrExceedsLinguAbcCefrLevel("C1", "C2")).toBe(false);
  });
});
