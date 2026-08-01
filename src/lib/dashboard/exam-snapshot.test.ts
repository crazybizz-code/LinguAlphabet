import { describe, it, expect } from "vitest";
import { buildBandProgress, daysUntilExam, describeExamCountdown, describeExamTimeline, formatBandValue } from "./exam-snapshot";

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

describe("daysUntilExam", () => {
  const now = new Date("2026-08-01T23:30:00.000Z");

  it("counts calendar days, not elapsed hours", () => {
    // Late at night, "tomorrow" is under 24h away but is still 1 day.
    expect(daysUntilExam("2026-08-02", now)).toBe(1);
  });

  it("returns 0 on the day itself", () => {
    expect(daysUntilExam("2026-08-01", now)).toBe(0);
  });

  it("goes negative once the date has passed", () => {
    expect(daysUntilExam("2026-07-30", now)).toBe(-2);
  });

  it("counts across a month boundary", () => {
    expect(daysUntilExam("2026-09-01", now)).toBe(31);
  });

  it("returns null for anything that isn't a YYYY-MM-DD date", () => {
    expect(daysUntilExam("next tuesday", now)).toBeNull();
    expect(daysUntilExam("", now)).toBeNull();
  });
});

describe("describeExamCountdown", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");

  it("earns the precise label only when a date is booked", () => {
    expect(describeExamCountdown({ examDate: "2026-08-15", examTimeline: "Within 2 weeks" }, now)).toEqual({
      label: "Days Until Exam",
      value: "14 days",
      precise: true,
    });
  });

  it("falls back to the bucket when no date is booked", () => {
    // The whole point: "Within 2 weeks" must never become "14 days" —
    // that invents precision the learner never gave.
    expect(describeExamCountdown({ examDate: null, examTimeline: "Within 2 weeks" }, now)).toEqual({
      label: "Exam Timeline",
      value: "2 weeks",
      precise: false,
    });
  });

  it("speaks in words for today and tomorrow rather than 0 and 1 days", () => {
    expect(describeExamCountdown({ examDate: "2026-08-01" }, now).value).toBe("Today");
    expect(describeExamCountdown({ examDate: "2026-08-02" }, now).value).toBe("Tomorrow");
  });

  it("says a past date has passed instead of counting backwards", () => {
    expect(describeExamCountdown({ examDate: "2026-07-01" }, now).value).toBe("Date passed");
  });

  it("prefers a booked date over the bucket when both exist", () => {
    const result = describeExamCountdown({ examDate: "2026-08-04", examTimeline: "More than 3 months" }, now);
    expect(result.value).toBe("3 days");
    expect(result.precise).toBe(true);
  });

  it("says the timing is unset when neither is known", () => {
    expect(describeExamCountdown({ examDate: null, examTimeline: null }, now)).toEqual({
      label: "Exam Timeline",
      value: "Not set",
      precise: false,
    });
  });
});
