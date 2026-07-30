/**
 * Streak — pure, no IO. Scoped to Daily Mission completions only
 * (docs/domain-model.md §19: "not just any content completion, so casual
 * Explore browsing can't incidentally inflate it") and never punitive on
 * a gap (docs/dashboard-user-flows.md §C14: "Life happens — let's start
 * a new streak today", never "you broke your streak").
 *
 * Streak Shield (Execution Sprint P1 — supabase/streak-shield-schema.sql):
 * a second earned way to keep a streak alive, on top of the philosophy
 * above, not a replacement for it. A casual completion on a day the
 * learner already banked today's mission credit earns one shield (capped
 * at MAX_SHIELDS); a banked shield covers exactly one later missed day
 * instead of the streak resetting.
 */
const MAX_SHIELDS = 1;

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetween(previousDate: string, today: string): number {
  const diffMs = new Date(today).getTime() - new Date(previousDate).getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

function isConsecutiveDay(previousDate: string, today: string): boolean {
  return daysBetween(previousDate, today) === 1;
}

export interface StreakResult {
  newStreak: number;
  newLongestStreak: number;
  streakContinued: boolean;
  newShields: number;
  shieldEarned: boolean;
  shieldUsed: boolean;
}

export function applyStreak(params: {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  isMission: boolean;
  shields: number;
  now?: Date;
}): StreakResult {
  const today = (params.now ?? new Date()).toISOString().slice(0, 10);
  const lastDate = params.lastStudyDate ? toDateOnly(params.lastStudyDate) : null;

  if (!params.isMission) {
    // A casual completion never moves the streak itself — but if today's
    // mission is already done (lastDate === today) and no shield is
    // banked yet, this second engagement today is exactly the "reason to
    // come back after the mission is done" the retention audit called
    // for: it earns one.
    const shieldEarned = lastDate === today && params.shields < MAX_SHIELDS;
    return {
      newStreak: params.currentStreak,
      newLongestStreak: params.longestStreak,
      streakContinued: false,
      newShields: shieldEarned ? params.shields + 1 : params.shields,
      shieldEarned,
      shieldUsed: false,
    };
  }

  let newStreak: number;
  let shieldUsed = false;
  let newShields = params.shields;

  if (lastDate === today) {
    newStreak = params.currentStreak; // already studied today's mission — no double-count
  } else if (lastDate && isConsecutiveDay(lastDate, today)) {
    newStreak = params.currentStreak + 1;
  } else if (lastDate && params.shields > 0 && daysBetween(lastDate, today) === 2) {
    // Exactly one day was missed, and a banked shield covers exactly one
    // — a bigger gap still resets below, since a single shield was never
    // meant to erase an extended absence.
    newStreak = params.currentStreak + 1;
    shieldUsed = true;
    newShields = params.shields - 1;
  } else {
    newStreak = 1; // fresh start — an uncovered gap resets, never below 1 on a completion day
  }

  return {
    newStreak,
    newLongestStreak: Math.max(params.longestStreak, newStreak),
    streakContinued: newStreak > params.currentStreak,
    newShields,
    shieldEarned: false,
    shieldUsed,
  };
}
