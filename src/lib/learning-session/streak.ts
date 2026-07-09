/**
 * Streak — pure, no IO. Scoped to Daily Mission completions only
 * (docs/domain-model.md §19: "not just any content completion, so casual
 * Explore browsing can't incidentally inflate it") and never punitive on
 * a gap (docs/dashboard-user-flows.md §C14: "Life happens — let's start
 * a new streak today", never "you broke your streak").
 */
function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function isConsecutiveDay(previousDate: string, today: string): boolean {
  const diffMs = new Date(today).getTime() - new Date(previousDate).getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000)) === 1;
}

export interface StreakResult {
  newStreak: number;
  newLongestStreak: number;
  streakContinued: boolean;
}

export function applyStreak(params: {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  isMission: boolean;
  now?: Date;
}): StreakResult {
  if (!params.isMission) {
    return { newStreak: params.currentStreak, newLongestStreak: params.longestStreak, streakContinued: false };
  }

  const today = (params.now ?? new Date()).toISOString().slice(0, 10);
  const lastDate = params.lastStudyDate ? toDateOnly(params.lastStudyDate) : null;

  let newStreak: number;
  if (lastDate === today) {
    newStreak = params.currentStreak; // already studied today's mission — no double-count
  } else if (lastDate && isConsecutiveDay(lastDate, today)) {
    newStreak = params.currentStreak + 1;
  } else {
    newStreak = 1; // fresh start — a gap resets, never below 1 on a completion day
  }

  return {
    newStreak,
    newLongestStreak: Math.max(params.longestStreak, newStreak),
    streakContinued: newStreak > params.currentStreak,
  };
}
