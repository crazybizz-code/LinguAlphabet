import { describe, it, expect } from "vitest";
import { buildBandProgress, describeExamTimeline, formatBandValue } from "./exam-snapshot";

describe("buildBandProgress", () => {
  it("scales both bands against the full 0-9 scale, not against the gap", () => {
    // 6.0 of 9 is two thirds of the way up the real scale. Scaling to the
    // gap instead would put every learner at the same place regardless of
    // whether they're at 4.0 or 8.0.
    const progress = buildBandProgress(6, 7.5);
    expect(progress?.currentPercent).toBeCloseTo(66.667, 2);
    expect(progress?.targetPercent).toBeCloseTo(83.333, 2);
    expect(progress?.bandsToGo).toBe(1.5);
  });

  it("returns null when the current band is unknown", () => {
    // "Not sure" during onboarding writes NULL on purpose — the header
    // must render a pre-placement state rather than invent a band.
    expect(buildBandProgress(null, 7.5)).toBeNull();
  });

  it("returns null when the target band is unknown", () => {
    expect(buildBandProgress(6, null)).toBeNull();
  });

  it("reports zero bands to go once the target is reached", () => {
    expect(buildBandProgress(7, 7)?.bandsToGo).toBe(0);
  });

  it("clamps rather than reporting a negative gap when the target is below the current band", () => {
    // Onboarding warns about this but doesn't block it, so it reaches us.
    expect(buildBandProgress(8, 6.5)?.bandsToGo).toBe(0);
  });

  it("avoids floating-point noise in the gap", () => {
    expect(buildBandProgress(6.5, 7)?.bandsToGo).toBe(0.5);
    expect(buildBandProgress(5.5, 8)?.bandsToGo).toBe(2.5);
  });
});

describe("describeExamTimeline", () => {
  it("shortens each onboarding bucket for the stat tile", () => {
    expect(describeExamTimeline("Within 2 weeks")).toBe("2 weeks");
    expect(describeExamTimeline("Within 1 month")).toBe("1 month");
    expect(describeExamTimeline("Within 3 months")).toBe("3 months");
    expect(describeExamTimeline("More than 3 months")).toBe("3+ months");
    expect(describeExamTimeline("I haven't booked it yet")).toBe("Not booked");
  });

  it("says the timing is unset rather than guessing a date", () => {
    expect(describeExamTimeline(null)).toBe("Not set");
    expect(describeExamTimeline(undefined)).toBe("Not set");
    expect(describeExamTimeline("")).toBe("Not set");
  });

  it("passes through an unmapped option instead of swallowing it", () => {
    // A new TIMELINE_OPTIONS entry is still real product copy.
    expect(describeExamTimeline("Within 6 months")).toBe("Within 6 months");
  });
});

describe("formatBandValue", () => {
  it("always shows one decimal place", () => {
    expect(formatBandValue(7)).toBe("7.0");
    expect(formatBandValue(6.5)).toBe("6.5");
  });

  it("renders an em dash for an unknown band rather than a zero", () => {
    expect(formatBandValue(null)).toBe("—");
  });
});
