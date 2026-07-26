import { z } from "zod";
import { startOfWeek } from "@/lib/content/home";
import type { ToolDefinition } from "../types";

const ResultSchema = z.object({
  streak: z.number().int(),
  xp: z.number().int(),
  level: z.string().nullable(),
  totalLessonsCompleted: z.number().int(),
  weeklyGoalMinutes: z.number(),
  weeklyMinutesSoFar: z.number(),
  longestStreak: z.number().int(),
});
type Result = z.infer<typeof ResultSchema>;

/** Same default the Dashboard/Progress/Explore pages fall back to for a learner with no onboarding daily-time value set. */
const DEFAULT_DAILY_GOAL_MINUTES = 20;
/** Large enough that a real learner's lifetime completion count is never truncated at MVP scale, without needing a dedicated count() method on SignalRepository. */
const COMPLETION_HISTORY_LIMIT = 1000;
const COMPLETION_SIGNAL_TYPES = ["article_completed", "podcast_completed"] as const;

/**
 * Blends the request's own LearningContext (streak/xp/level — already
 * known, no lookup needed) with real aggregates from the same
 * repositories every other AI surface reads: LearnerRepository for
 * dailyGoalMinutes/longestStreak (src/ai/data, the same source Dashboard/
 * Progress/Explore/Profile and Tuto's own system prompt all read), and
 * SignalRepository for lesson-completion history (each
 * article_completed/podcast_completed signal already carries
 * `estimatedMinutes` in its evidence — recorded once per completion by
 * src/lib/learning-session/complete-mission.ts). No new repository, no
 * new signal type — this tool previously answered from MOCK_PROGRESS
 * (src/ai/tools/mock-data.ts); it now answers from the same real data
 * every other surface already shows the learner.
 */
export const getLearningProgressTool: ToolDefinition<Record<string, never>, Result> = {
  name: "getLearningProgress",
  description: "Get the learner's current streak, XP, level, and weekly progress toward their study goal.",
  parameters: { type: "object", properties: {}, required: [] },
  resultSchema: ResultSchema,
  async execute(_args, context) {
    const streak = context.learningContext.streak ?? 0;
    const xp = context.learningContext.xp ?? 0;
    const level = context.learningContext.userLevel ?? null;

    if (!context.dependencies) {
      return { streak, xp, level, totalLessonsCompleted: 0, weeklyGoalMinutes: 0, weeklyMinutesSoFar: 0, longestStreak: 0 };
    }

    const [profile, completions] = await Promise.all([
      context.dependencies.learnerRepository.getProfile(),
      context.dependencies.signalRepository.listRecent({ types: [...COMPLETION_SIGNAL_TYPES], limit: COMPLETION_HISTORY_LIMIT }),
    ]);

    const weekStart = startOfWeek(new Date());
    const weeklyMinutesSoFar = completions
      .filter((signal) => new Date(signal.createdAt) >= weekStart)
      .reduce((sum, signal) => sum + (typeof signal.evidence.estimatedMinutes === "number" ? signal.evidence.estimatedMinutes : 0), 0);

    return {
      streak,
      xp,
      level,
      totalLessonsCompleted: completions.length,
      weeklyGoalMinutes: (profile.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES) * 7,
      weeklyMinutesSoFar,
      longestStreak: profile.studyConsistency?.longestStreak ?? 0,
    };
  },
};
