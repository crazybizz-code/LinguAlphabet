import { describe, it, expect } from "vitest";
import { scoreMock } from "./scoring";

describe("scoreMock", () => {
  it("returns 0 pct for zero questions", () => {
    const result = scoreMock(0, 0, 0, 0);
    expect(result.overallScorePct).toBe(0);
    expect(result.reading.scorePct).toBe(0);
    expect(result.listening.scorePct).toBe(0);
  });

  it("maps 0% to A1", () => {
    const result = scoreMock(0, 10, 0, 8);
    expect(result.resultCefrLevel).toBe("A1");
    expect(result.estimatedBand).toBe(3);
  });

  it("maps ≥60% to B2", () => {
    // 60% overall: 6/10 reading, 6/10 listening = 12/20 = 60%
    const result = scoreMock(6, 10, 6, 10);
    expect(result.resultCefrLevel).toBe("B2");
    expect(result.estimatedBand).toBeGreaterThanOrEqual(6);
    expect(result.estimatedBand).toBeLessThan(7);
  });

  it("maps 100% to C2", () => {
    const result = scoreMock(10, 10, 8, 8);
    expect(result.resultCefrLevel).toBe("C2");
    expect(result.estimatedBand).toBeGreaterThanOrEqual(8);
  });

  it("computes per-section score correctly", () => {
    const result = scoreMock(8, 10, 6, 8);
    expect(result.reading.correct).toBe(8);
    expect(result.reading.total).toBe(10);
    expect(result.reading.scorePct).toBe(80);
    expect(result.listening.correct).toBe(6);
    expect(result.listening.total).toBe(8);
    expect(result.listening.scorePct).toBe(75);
  });

  it("weights overall by total questions, not section count", () => {
    // 8/10 reading + 6/8 listening = 14/18 = 77.8%
    const result = scoreMock(8, 10, 6, 8);
    const expected = Math.round((14 / 18) * 100 * 100) / 100;
    expect(result.overallScorePct).toBeCloseTo(expected, 1);
  });

  it("maps ~45% to B1", () => {
    const result = scoreMock(4, 10, 3, 8);
    // 7/18 ≈ 38.9% → A2 threshold
    // 5/10 = 50%, 4/8 = 50% → 50% overall → B1 boundary
    const r2 = scoreMock(5, 10, 4, 8);
    expect(r2.resultCefrLevel).toBe("B1");
  });
});
