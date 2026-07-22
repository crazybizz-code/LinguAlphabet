import { z } from "zod";
import type { ToolDefinition } from "../types";
import { MOCK_PROGRESS } from "../mock-data";

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

/**
 * Blends the request's own LearningContext (streak/xp/level — already
 * known, no lookup needed) with supplemental mock stats no context field
 * carries yet (weekly minutes, longest streak, lessons completed). A real
 * implementation replaces only the MOCK_PROGRESS half with a Supabase
 * query (docs/ai-architecture.md).
 */
export const getLearningProgressTool: ToolDefinition<Record<string, never>, Result> = {
  name: "getLearningProgress",
  description: "Get the learner's current streak, XP, level, and weekly progress toward their study goal.",
  parameters: { type: "object", properties: {}, required: [] },
  resultSchema: ResultSchema,
  async execute(_args, context) {
    return {
      streak: context.learningContext.streak ?? 0,
      xp: context.learningContext.xp ?? 0,
      level: context.learningContext.userLevel ?? null,
      totalLessonsCompleted: MOCK_PROGRESS.totalLessonsCompleted,
      weeklyGoalMinutes: MOCK_PROGRESS.weeklyGoalMinutes,
      weeklyMinutesSoFar: MOCK_PROGRESS.weeklyMinutesSoFar,
      longestStreak: MOCK_PROGRESS.longestStreak,
    };
  },
};
