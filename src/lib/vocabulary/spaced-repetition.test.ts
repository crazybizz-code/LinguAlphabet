import { describe, it, expect } from "vitest";
import { applyReviewResult } from "./spaced-repetition";

describe("applyReviewResult", () => {
  it("advances one box on a correct recall and schedules the matching interval", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(applyReviewResult({ currentBox: 1, wasCorrect: true, now })).toEqual({
      newBox: 2,
      newDueDate: "2026-01-04",
    });
    expect(applyReviewResult({ currentBox: 2, wasCorrect: true, now })).toEqual({
      newBox: 3,
      newDueDate: "2026-01-08",
    });
    expect(applyReviewResult({ currentBox: 4, wasCorrect: true, now })).toEqual({
      newBox: 5,
      newDueDate: "2026-01-31",
    });
  });

  it("caps at box 5 and keeps cycling at the longest interval rather than erroring", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(applyReviewResult({ currentBox: 5, wasCorrect: true, now })).toEqual({
      newBox: 5,
      newDueDate: "2026-01-31",
    });
  });

  it("drops straight back to box 1 on an incorrect recall, regardless of prior box", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    for (const currentBox of [1, 2, 3, 4, 5] as const) {
      expect(applyReviewResult({ currentBox, wasCorrect: false, now })).toEqual({
        newBox: 1,
        newDueDate: "2026-01-02",
      });
    }
  });
});
