import { describe, it, expect } from "vitest";
import { computeKpisFromEvents, type RawEvent } from "./kpis";

const NOW = new Date("2026-02-01T12:00:00.000Z");

function ev(name: RawEvent["event_name"], userId: string, createdAt: string, properties: Record<string, unknown> = {}): RawEvent {
  return { user_id: userId, event_name: name, properties, created_at: createdAt };
}

describe("computeKpisFromEvents", () => {
  it("counts DAU as distinct users with any event today, and WAU over the trailing 7 days", () => {
    const events: RawEvent[] = [
      ev("session_started", "u1", "2026-02-01T09:00:00.000Z", { entryPath: "/dashboard" }),
      ev("lesson_started", "u1", "2026-02-01T09:05:00.000Z", { contentId: "a", contentType: "article", slotType: "casual", cefrLevel: "B1" }),
      ev("session_started", "u2", "2026-02-01T10:00:00.000Z", { entryPath: "/dashboard" }),
      ev("session_started", "u3", "2026-01-28T10:00:00.000Z", { entryPath: "/dashboard" }), // within WAU window, not DAU
      ev("session_started", "u4", "2026-01-10T10:00:00.000Z", { entryPath: "/dashboard" }), // outside both windows
    ];
    const result = computeKpisFromEvents(events, NOW);
    expect(result.dau).toBe(2); // u1, u2
    expect(result.wau).toBe(3); // u1, u2, u3
  });

  it("computes D1 retention only from cohorts old enough to have a full D+1 window, counting any event as a return", () => {
    const events: RawEvent[] = [
      // u1 signed up 2026-01-30, returned 2026-01-31 (D+1) -> retained
      ev("signup_completed", "u1", "2026-01-30T08:00:00.000Z", { method: "email" }),
      ev("session_started", "u1", "2026-01-31T08:00:00.000Z", { entryPath: "/dashboard" }),
      // u2 signed up 2026-01-30, never returned -> not retained
      ev("signup_completed", "u2", "2026-01-30T08:00:00.000Z", { method: "email" }),
      // u3 signed up 2026-01-31 — D+1 is 2026-02-01, "now"'s own calendar
      // day, so the cohort is already eligible even though today (their
      // D+1 day) isn't over yet; u3 hasn't returned as of this snapshot.
      ev("signup_completed", "u3", "2026-01-31T20:00:00.000Z", { method: "email" }),
      // u4 signed up earlier today — D+1 is tomorrow, genuinely not elapsed yet -> excluded
      ev("signup_completed", "u4", "2026-02-01T07:00:00.000Z", { method: "email" }),
    ];
    const result = computeKpisFromEvents(events, NOW);
    expect(result.d1Retention.denominator).toBe(3); // u1, u2, u3 — u4 excluded (too new)
    expect(result.d1Retention.numerator).toBe(1); // only u1 returned
    expect(result.d1Retention.rate).toBeCloseTo(1 / 3);
  });

  it("computes lesson and mission completion rates from lesson_started/lesson_completed pairs", () => {
    const events: RawEvent[] = [
      ev("lesson_started", "u1", "2026-02-01T08:00:00.000Z", { contentId: "a", contentType: "article", slotType: "mission", cefrLevel: "B1" }),
      ev("lesson_completed", "u1", "2026-02-01T08:10:00.000Z", {
        contentId: "a",
        contentType: "article",
        isMission: true,
        xpEarned: 50,
        quizScore: 4,
        quizTotal: 5,
        durationMinutes: 10,
        streakAfter: 3,
      }),
      ev("lesson_started", "u2", "2026-02-01T09:00:00.000Z", { contentId: "b", contentType: "podcast", slotType: "casual", cefrLevel: "B2" }),
      // u2 never finishes -> lowers lesson completion but isn't a mission start at all
    ];
    const result = computeKpisFromEvents(events, NOW);
    expect(result.lessonCompletion).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(result.missionCompletion).toEqual({ numerator: 1, denominator: 1, rate: 1 });
  });

  it("returns null rates (not zero, not a crash) when there's no denominator yet", () => {
    const result = computeKpisFromEvents([], NOW);
    expect(result.lessonCompletion.rate).toBeNull();
    expect(result.d1Retention.rate).toBeNull();
    expect(result.averageSessionMinutes).toBeNull();
    expect(result.premiumConversion.status).toBe("not_applicable");
  });

  it("computes average session length in minutes from session_ended durationMs", () => {
    const events: RawEvent[] = [
      ev("session_ended", "u1", "2026-02-01T08:10:00.000Z", { durationMs: 120000 }), // 2 min
      ev("session_ended", "u2", "2026-02-01T09:10:00.000Z", { durationMs: 60000 }), // 1 min
    ];
    const result = computeKpisFromEvents(events, NOW);
    expect(result.averageSessionMinutes).toBeCloseTo(1.5);
    expect(result.sessionSampleSize).toBe(2);
  });

  it("counts a streak_shield_used as an automatic recovery, and a real reset as recovered only if a later mission completion reaches streak >= 3 within the window", () => {
    const events: RawEvent[] = [
      // u1: reset 20 days ago (window elapsed), recovered 10 days later at streak 3
      ev("streak_reset", "u1", "2026-01-12T08:00:00.000Z", { previousStreak: 8, longestStreak: 8 }),
      ev("lesson_completed", "u1", "2026-01-15T08:00:00.000Z", {
        contentId: "a",
        contentType: "article",
        isMission: true,
        xpEarned: 50,
        quizScore: 1,
        quizTotal: 1,
        durationMinutes: 5,
        streakAfter: 3,
      }),
      // u2: reset 20 days ago, never recovered
      ev("streak_reset", "u2", "2026-01-12T08:00:00.000Z", { previousStreak: 5, longestStreak: 5 }),
      // u3: shield used instead of ever resetting
      ev("streak_shield_used", "u3", "2026-01-20T08:00:00.000Z", { streakAfter: 6 }),
    ];
    const result = computeKpisFromEvents(events, NOW);
    // eligible resets: u1, u2 (2) + shields: u3 (1) => denominator 3
    // recoveries: u1 (1) + shields: u3 (1) => numerator 2
    expect(result.streakRecoveryRate).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
  });

  it("computes push notification CTR as clicks over sends", () => {
    const events: RawEvent[] = [
      ev("notification_sent", "u1", "2026-02-01T08:00:00.000Z", { streakAtSend: 5 }),
      ev("notification_sent", "u2", "2026-02-01T08:00:00.000Z", { streakAtSend: 3 }),
      ev("notification_clicked", "u1", "2026-02-01T08:05:00.000Z", {}),
    ];
    const result = computeKpisFromEvents(events, NOW);
    expect(result.pushNotificationCtr).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
  });
});
