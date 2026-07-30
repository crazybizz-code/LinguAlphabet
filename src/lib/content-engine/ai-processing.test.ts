import { describe, it, expect } from "vitest";
import { computeReadingDifficulty, estimateReadingTimeMinutes } from "./ai-processing";

describe("computeReadingDifficulty", () => {
  it("scores simple, short-sentence prose as easier than dense academic prose", () => {
    const simple = "The cat sat on the mat. The dog ran fast. We had fun today.";
    const dense =
      "Notwithstanding the epistemological considerations articulated previously, the methodological " +
      "framework necessitates a comprehensive reevaluation of the underlying theoretical presuppositions.";

    expect(computeReadingDifficulty(simple)).toBeGreaterThan(computeReadingDifficulty(dense));
  });

  it("clamps into the 0-100 range rather than emitting a raw out-of-band Flesch score", () => {
    const pathological =
      "Incomprehensibility notwithstanding interdisciplinary characterizations perpetuating " +
      "institutionalization internationalization counterrevolutionaries";
    const score = computeReadingDifficulty(pathological);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 0 for empty input instead of NaN", () => {
    expect(computeReadingDifficulty("")).toBe(0);
    expect(computeReadingDifficulty("   ")).toBe(0);
  });

  it("is deterministic — identical text always scores identically", () => {
    const text = "Learning a language takes time. Practice every day and you will improve.";
    expect(computeReadingDifficulty(text)).toBe(computeReadingDifficulty(text));
  });
});

describe("estimateReadingTimeMinutes", () => {
  it("never returns less than the two-minute floor", () => {
    expect(estimateReadingTimeMinutes("Three words here")).toBe(2);
  });

  it("scales with word count", () => {
    const long = Array.from({ length: 1000 }, () => "word").join(" ");
    expect(estimateReadingTimeMinutes(long)).toBe(5);
  });
});
