import { z } from "zod";

/**
 * Performance Tracking (Sprint 10): schemas and interfaces only — no
 * database, no storage implementation, per the brief. These are the
 * structured event records a future implementation would persist
 * per-learner; `LearnerProfile.recentMistakes` (./types.ts) is the
 * compact rolling summary such a store would derive from these, not a
 * duplicate of them.
 */

const PerformanceRecordBaseSchema = z.object({
  id: z.string(),
  learnerId: z.string(),
  /** ISO 8601 timestamp — a plain string since this module has no date-handling opinion, same as LearningContext leaving timestamps as plain numbers/strings elsewhere. */
  occurredAt: z.string(),
});

export const GrammarMistakeRecordSchema = PerformanceRecordBaseSchema.extend({
  type: z.literal("grammarMistake"),
  /** Ties to a src/ai/knowledge GrammarUnit id when the mistake maps to a known unit (e.g. "present-perfect") — null when it doesn't match one cleanly. */
  grammarUnitId: z.string().nullable(),
  learnerText: z.string(),
  correctedText: z.string(),
  note: z.string().optional(),
});
export type GrammarMistakeRecord = z.infer<typeof GrammarMistakeRecordSchema>;

export const VocabularyMistakeRecordSchema = PerformanceRecordBaseSchema.extend({
  type: z.literal("vocabularyMistake"),
  word: z.string(),
  mistakeDescription: z.string(),
});
export type VocabularyMistakeRecord = z.infer<typeof VocabularyMistakeRecordSchema>;

export const PronunciationIssueRecordSchema = PerformanceRecordBaseSchema.extend({
  type: z.literal("pronunciationIssue"),
  word: z.string().nullable(),
  /** The specific sound involved, e.g. "/θ/ vs /s/" — null when the issue isn't isolated to one phoneme. */
  sound: z.string().nullable(),
  description: z.string(),
});
export type PronunciationIssueRecord = z.infer<typeof PronunciationIssueRecordSchema>;

export const QuizPerformanceRecordSchema = PerformanceRecordBaseSchema.extend({
  type: z.literal("quizPerformance"),
  quizId: z.string().nullable(),
  scorePercent: z.number().min(0).max(100),
  weakQuestionTopics: z.array(z.string()).default([]),
});
export type QuizPerformanceRecord = z.infer<typeof QuizPerformanceRecordSchema>;

export const WritingFeedbackRecordSchema = PerformanceRecordBaseSchema.extend({
  type: z.literal("writingFeedback"),
  /** Ties to a src/ai/knowledge WritingPrompt asset id when the feedback was on a known prompt. */
  promptId: z.string().nullable(),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
});
export type WritingFeedbackRecord = z.infer<typeof WritingFeedbackRecordSchema>;

export const SpeakingFeedbackRecordSchema = PerformanceRecordBaseSchema.extend({
  type: z.literal("speakingFeedback"),
  promptId: z.string().nullable(),
  fluencyNote: z.string().optional(),
  pronunciationNote: z.string().optional(),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
});
export type SpeakingFeedbackRecord = z.infer<typeof SpeakingFeedbackRecordSchema>;

/** Every performance event a future store would record, discriminated by `type`. */
export const PerformanceRecordSchema = z.discriminatedUnion("type", [
  GrammarMistakeRecordSchema,
  VocabularyMistakeRecordSchema,
  PronunciationIssueRecordSchema,
  QuizPerformanceRecordSchema,
  WritingFeedbackRecordSchema,
  SpeakingFeedbackRecordSchema,
]);
export type PerformanceRecord = z.infer<typeof PerformanceRecordSchema>;

/** The shape a future per-learner performance log would take — an interface only, nothing persists it yet. */
export const PerformanceHistorySchema = z.object({
  learnerId: z.string(),
  records: z.array(PerformanceRecordSchema),
});
export type PerformanceHistory = z.infer<typeof PerformanceHistorySchema>;
