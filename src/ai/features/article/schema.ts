import { z } from "zod";

/**
 * The three whole-article structured capabilities Sprint 5 asked for.
 * Each is deliberately independent — a learner might want just a summary
 * right now and questions later, not always all three together.
 */

export const ArticleSummarySchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()).min(1),
});
export type ArticleSummary = z.infer<typeof ArticleSummarySchema>;

export const DiscussionQuestionsSchema = z.object({
  questions: z.array(z.string()).min(1),
});
export type DiscussionQuestions = z.infer<typeof DiscussionQuestionsSchema>;

/** Same shape as src/ai/tools/mock-data.ts's MockQuizQuestion — one rendering component can serve both later. */
const ComprehensionQuestionSchema = z.object({
  prompt: z.string(),
  choices: z.array(z.string()).min(2),
  correctChoiceIndex: z.number().int().nonnegative(),
});

export const ComprehensionQuestionsSchema = z.object({
  questions: z.array(ComprehensionQuestionSchema).min(1),
});
export type ComprehensionQuestions = z.infer<typeof ComprehensionQuestionsSchema>;
