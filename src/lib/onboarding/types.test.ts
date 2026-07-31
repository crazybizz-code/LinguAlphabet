import { describe, it, expect } from "vitest";
import {
  INITIAL_ONBOARDING_DATA,
  TOTAL_STEPS,
  bandToCefr,
  canAdvance,
  isTargetBandTooLow,
  type OnboardingData,
} from "./types";
import { CURRENT_BAND_OPTIONS, TARGET_BAND_OPTIONS, formatBand } from "./constants";

function data(overrides: Partial<OnboardingData> = {}): OnboardingData {
  return { ...INITIAL_ONBOARDING_DATA, ...overrides };
}

describe("band options", () => {
  it("offers the exact current-band set, 4.0 through 9.0 in half steps", () => {
    expect(CURRENT_BAND_OPTIONS).toEqual([4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0]);
  });

  it("offers the exact target-band set, starting at 5.0", () => {
    expect(TARGET_BAND_OPTIONS).toEqual([5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0]);
  });

  it("always renders one decimal place — '7' would read as a different scale", () => {
    expect(formatBand(7)).toBe("7.0");
    expect(formatBand(6.5)).toBe("6.5");
  });
});

describe("isTargetBandTooLow", () => {
  it("flags a target below the current band", () => {
    expect(isTargetBandTooLow(data({ currentBand: 7.0, targetBand: 6.0 }))).toBe(true);
  });

  it("allows a target EQUAL to the current band — the handoff compares strictly less-than, so holding a band is a valid goal", () => {
    expect(isTargetBandTooLow(data({ currentBand: 6.5, targetBand: 6.5 }))).toBe(false);
    expect(canAdvance("targetBand", data({ currentBand: 6.5, targetBand: 6.5 }))).toBe(true);
  });

  it("does not flag a genuine improvement", () => {
    expect(isTargetBandTooLow(data({ currentBand: 6.0, targetBand: 7.5 }))).toBe(false);
  });

  it("never flags while 'Not sure' is selected — there is nothing to compare against", () => {
    expect(isTargetBandTooLow(data({ currentBandUnsure: true, currentBand: null, targetBand: 5.0 }))).toBe(false);
  });

  it("does not flag before both bands are answered", () => {
    expect(isTargetBandTooLow(data({ currentBand: 7.0, targetBand: null }))).toBe(false);
    expect(isTargetBandTooLow(data({ currentBand: null, targetBand: 5.0 }))).toBe(false);
  });
});

describe("canAdvance", () => {
  it("requires a non-blank name", () => {
    expect(canAdvance("name", data({ displayName: "" }))).toBe(false);
    expect(canAdvance("name", data({ displayName: "   " }))).toBe(false);
    expect(canAdvance("name", data({ displayName: "Aziza" }))).toBe(true);
  });

  it("only accepts IELTS Academic", () => {
    expect(canAdvance("exam", data({ examType: "IELTS Academic" }))).toBe(true);
    expect(canAdvance("exam", data({ examType: "TOEFL iBT" }))).toBe(false);
  });

  it("accepts 'Not sure' as a real answer for current band", () => {
    expect(canAdvance("currentBand", data())).toBe(false);
    expect(canAdvance("currentBand", data({ currentBandUnsure: true }))).toBe(true);
    expect(canAdvance("currentBand", data({ currentBand: 6.0 }))).toBe(true);
  });

  it("blocks the target step while the warning is showing", () => {
    expect(canAdvance("targetBand", data({ currentBand: 7.0, targetBand: 6.0 }))).toBe(false);
    expect(canAdvance("targetBand", data({ currentBand: 7.0, targetBand: 8.0 }))).toBe(true);
  });

  it("allows any target when the current band is unknown", () => {
    expect(canAdvance("targetBand", data({ currentBandUnsure: true, targetBand: 5.0 }))).toBe(true);
  });

  it("requires a timeline and a daily time", () => {
    expect(canAdvance("examDate", data())).toBe(false);
    expect(canAdvance("examDate", data({ examTimeline: "Within 1 month" }))).toBe(true);
    expect(canAdvance("dailyTime", data())).toBe(false);
    expect(canAdvance("dailyTime", data({ dailyTime: 30 }))).toBe(true);
  });

  it("never blocks the final placement screen", () => {
    expect(canAdvance("placement", data())).toBe(true);
  });
});

describe("bandToCefr", () => {
  it("maps bands onto the published CEFR alignment", () => {
    expect(bandToCefr(4.0)).toBe("B1");
    expect(bandToCefr(5.0)).toBe("B1");
    expect(bandToCefr(5.5)).toBe("B2");
    expect(bandToCefr(6.5)).toBe("B2");
    expect(bandToCefr(7.0)).toBe("C1");
    expect(bandToCefr(8.0)).toBe("C1");
    expect(bandToCefr(8.5)).toBe("C2");
    expect(bandToCefr(9.0)).toBe("C2");
  });

  it("returns null for an unknown band rather than inventing a level", () => {
    expect(bandToCefr(null)).toBeNull();
  });
});

describe("wizard shape", () => {
  it("has exactly the seven designed steps", () => {
    expect(TOTAL_STEPS).toBe(7);
  });

  it("starts with IELTS Academic preselected and nothing else answered", () => {
    expect(INITIAL_ONBOARDING_DATA.examType).toBe("IELTS Academic");
    expect(INITIAL_ONBOARDING_DATA.currentBand).toBeNull();
    expect(INITIAL_ONBOARDING_DATA.targetBand).toBeNull();
    expect(INITIAL_ONBOARDING_DATA.currentBandUnsure).toBe(false);
  });
});
