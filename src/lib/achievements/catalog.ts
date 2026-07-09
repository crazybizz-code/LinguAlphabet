/**
 * The catalog of discrete, named milestones (docs/domain-model.md §22) —
 * treated as content in its own right, not hardcoded per-screen strings,
 * same "managed catalog" principle as Tuto Messages (§23).
 */
export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  { id: "first_session", title: "First Session", description: "Completed your first lesson", icon: "🌱" },
  { id: "five_sessions", title: "5 Sessions", description: "Completed five lessons", icon: "📚" },
  { id: "streak_3", title: "3 Day Streak", description: "Three days in a row", icon: "🔥" },
  { id: "streak_7", title: "7 Day Streak", description: "Seven consecutive days", icon: "⚡" },
  { id: "streak_30", title: "30 Day Streak", description: "Thirty consecutive days", icon: "🏆" },
  { id: "level_up", title: "Level Up", description: "Reached Level 2", icon: "🎓" },
];

/**
 * Which catalog entries are earned, computed from the learner's current
 * real state (completed-lesson count, longest streak, level). This is a
 * v1 compute-on-read approximation, not a persisted unlock-event log —
 * the `achievements` table (supabase-schema.sql) exists for that, but
 * nothing writes to it yet since there's no completion pipeline until
 * the Learning Session ships (task #33). Swapping this for a real
 * earned-at-the-moment-it-happens record later doesn't change the
 * catalog or any caller — only how "earned" is determined.
 */
export function computeEarnedAchievementIds(input: {
  completedCount: number;
  longestStreak: number;
  level: number;
}): Set<string> {
  const earned = new Set<string>();
  if (input.completedCount >= 1) earned.add("first_session");
  if (input.completedCount >= 5) earned.add("five_sessions");
  if (input.longestStreak >= 3) earned.add("streak_3");
  if (input.longestStreak >= 7) earned.add("streak_7");
  if (input.longestStreak >= 30) earned.add("streak_30");
  if (input.level >= 2) earned.add("level_up");
  return earned;
}
