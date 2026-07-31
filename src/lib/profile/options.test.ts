import { describe, it, expect } from "vitest";
import { selectableTargetBands } from "./options";
import { DAILY_TIME_OPTIONS, TARGET_BAND_OPTIONS } from "@/lib/onboarding/constants";
import { isTargetBandTooLow, INITIAL_ONBOARDING_DATA } from "@/lib/onboarding/types";

describe("selectableTargetBands", () => {
  it("hides every band below the learner's current one", () => {
    expect(selectableTargetBands(7)).toEqual([7, 7.5, 8, 8.5, 9]);
  });

  it("keeps the band equal to the current one", () => {
    // isTargetBandTooLow uses a strict `<`, so someone maintaining a 7.0
    // is a legitimate answer, not a validation error.
    expect(selectableTargetBands(7)).toContain(7);
  });

  it("offers every band when the current one is unknown", () => {
    // "Not sure" writes NULL; there is no floor to compare against, and
    // inventing one would be the fabrication the null exists to avoid.
    expect(selectableTargetBands(null)).toEqual(TARGET_BAND_OPTIONS);
  });

  it("never offers a target onboarding itself would have blocked", () => {
    // Profile is the only other write path for target_band. If this ever
    // diverges, Profile becomes the way around onboarding's validation.
    for (const currentBand of [4, 5.5, 6, 7.5, 9]) {
      for (const targetBand of selectableTargetBands(currentBand)) {
        const blocked = isTargetBandTooLow({ ...INITIAL_ONBOARDING_DATA, currentBand, targetBand });
        expect(blocked, `current ${currentBand} -> target ${targetBand}`).toBe(false);
      }
    }
  });

  it("still offers something at the top of the scale", () => {
    expect(selectableTargetBands(9)).toEqual([9]);
  });
});

describe("profile option lists", () => {
  it("shares the daily-time list with onboarding rather than redefining it", () => {
    // These were separate copies and had drifted — onboarding offered
    // 15/30/45/60 while Profile offered 10/20/30/45/60, so a learner who
    // picked 15 found no option selected on their own Profile.
    expect(DAILY_TIME_OPTIONS.map((option) => option.value)).toEqual([15, 30, 45, 60]);
  });
});
