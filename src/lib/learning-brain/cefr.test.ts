import { describe, it, expect } from "vitest";
import { cefrIndex, formatCefrRange } from "./cefr";

describe("formatCefrRange", () => {
  it("returns a single level when min and max are equal", () => {
    expect(formatCefrRange("B1", "B1")).toBe("B1");
    expect(formatCefrRange("A1", "A1")).toBe("A1");
    expect(formatCefrRange("C2", "C2")).toBe("C2");
  });

  it("returns a dash-separated range when min and max differ", () => {
    expect(formatCefrRange("B1", "B2")).toBe("B1–B2");
    expect(formatCefrRange("A2", "B1")).toBe("A2–B1");
    expect(formatCefrRange("A1", "C2")).toBe("A1–C2");
  });
});

/**
 * These tests verify the range-inclusion filter logic used in ExploreView:
 *   cefrIndex(item.cefrLevelMin) <= cefrIndex(levelFilter) <= cefrIndex(item.cefrLevelMax)
 *
 * The filter itself lives in a React component so we test the underlying
 * utility (cefrIndex) in isolation, confirming the invariants the filter relies on.
 */
describe("cefrIndex — range-inclusion filter invariants", () => {
  function inRange(itemMin: string, itemMax: string, filter: string): boolean {
    const filterIdx = cefrIndex(filter);
    return cefrIndex(itemMin) <= filterIdx && filterIdx <= cefrIndex(itemMax);
  }

  it("B1–B2 content matches a B1 filter", () => {
    expect(inRange("B1", "B2", "B1")).toBe(true);
  });

  it("B1–B2 content matches a B2 filter", () => {
    expect(inRange("B1", "B2", "B2")).toBe(true);
  });

  it("B1–B2 content does NOT match an A2 filter", () => {
    expect(inRange("B1", "B2", "A2")).toBe(false);
  });

  it("B1–B2 content does NOT match a C1 filter", () => {
    expect(inRange("B1", "B2", "C1")).toBe(false);
  });

  it("A2–B1 content matches both A2 and B1 filters", () => {
    expect(inRange("A2", "B1", "A2")).toBe(true);
    expect(inRange("A2", "B1", "B1")).toBe(true);
  });

  it("A2–B1 content does NOT match A1 or B2 filters", () => {
    expect(inRange("A2", "B1", "A1")).toBe(false);
    expect(inRange("A2", "B1", "B2")).toBe(false);
  });

  it("B1–B1 content matches only B1", () => {
    expect(inRange("B1", "B1", "B1")).toBe(true);
    expect(inRange("B1", "B1", "A2")).toBe(false);
    expect(inRange("B1", "B1", "B2")).toBe(false);
  });
});
