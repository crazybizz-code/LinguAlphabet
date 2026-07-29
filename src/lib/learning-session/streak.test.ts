import { describe, it, expect } from "vitest";
import { applyStreak } from "./streak";

const TODAY = new Date("2026-01-10T00:00:00.000Z");

describe("applyStreak", () => {
  it("does not move the streak for a casual (non-mission) completion", () => {
    const result = applyStreak({ currentStreak: 5, longestStreak: 10, lastStudyDate: null, isMission: false, shields: 0, now: TODAY });
    expect(result.newStreak).toBe(5);
    expect(result.streakContinued).toBe(false);
  });

  it("continues the streak on a consecutive-day mission completion", () => {
    const result = applyStreak({
      currentStreak: 5,
      longestStreak: 10,
      lastStudyDate: "2026-01-09T12:00:00.000Z",
      isMission: true,
      shields: 0,
      now: TODAY,
    });
    expect(result.newStreak).toBe(6);
    expect(result.streakContinued).toBe(true);
  });

  it("does not double-count a second mission completion on the same day", () => {
    const result = applyStreak({
      currentStreak: 6,
      longestStreak: 10,
      lastStudyDate: "2026-01-10T08:00:00.000Z",
      isMission: true,
      shields: 0,
      now: TODAY,
    });
    expect(result.newStreak).toBe(6);
    expect(result.streakContinued).toBe(false);
  });

  it("resets to 1 on an uncovered gap with no shield banked", () => {
    const result = applyStreak({
      currentStreak: 6,
      longestStreak: 10,
      lastStudyDate: "2026-01-05T00:00:00.000Z",
      isMission: true,
      shields: 0,
      now: TODAY,
    });
    expect(result.newStreak).toBe(1);
  });

  describe("streak shields", () => {
    it("earns a shield on a casual completion once today's mission is already done", () => {
      const result = applyStreak({
        currentStreak: 4,
        longestStreak: 10,
        lastStudyDate: "2026-01-10T08:00:00.000Z", // mission already completed today
        isMission: false,
        shields: 0,
        now: TODAY,
      });
      expect(result.shieldEarned).toBe(true);
      expect(result.newShields).toBe(1);
    });

    it("does not earn a shield from a casual completion if today's mission isn't done yet", () => {
      const result = applyStreak({
        currentStreak: 4,
        longestStreak: 10,
        lastStudyDate: "2026-01-09T08:00:00.000Z", // yesterday, not today
        isMission: false,
        shields: 0,
        now: TODAY,
      });
      expect(result.shieldEarned).toBe(false);
      expect(result.newShields).toBe(0);
    });

    it("caps at one banked shield", () => {
      const result = applyStreak({
        currentStreak: 4,
        longestStreak: 10,
        lastStudyDate: "2026-01-10T08:00:00.000Z",
        isMission: false,
        shields: 1,
        now: TODAY,
      });
      expect(result.shieldEarned).toBe(false);
      expect(result.newShields).toBe(1);
    });

    it("spends a banked shield to cover exactly one missed day instead of resetting", () => {
      const result = applyStreak({
        currentStreak: 6,
        longestStreak: 10,
        lastStudyDate: "2026-01-08T00:00:00.000Z", // one full day skipped (Jan 9)
        isMission: true,
        shields: 1,
        now: TODAY,
      });
      expect(result.newStreak).toBe(7);
      expect(result.streakContinued).toBe(true);
      expect(result.shieldUsed).toBe(true);
      expect(result.newShields).toBe(0);
    });

    it("still resets on a gap larger than one day, even with a shield banked", () => {
      const result = applyStreak({
        currentStreak: 6,
        longestStreak: 10,
        lastStudyDate: "2026-01-05T00:00:00.000Z", // multiple days skipped
        isMission: true,
        shields: 1,
        now: TODAY,
      });
      expect(result.newStreak).toBe(1);
      expect(result.shieldUsed).toBe(false);
      expect(result.newShields).toBe(1); // shield preserved for a real single-day gap later
    });
  });
});
