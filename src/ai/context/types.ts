import { z } from "zod";

/**
 * Deliberately self-contained (not imported from @/types/content or the
 * onboarding flow) — the AI module must stay portable and feature-agnostic.
 * The app layer maps its own types onto this shape at the call site; the
 * AI module never reaches back into app-specific types.
 */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const CefrLevelSchema = z.enum(CEFR_LEVELS);
export type CefrLevel = z.infer<typeof CefrLevelSchema>;

/**
 * Examples from the product today, not an exhaustive/closed list — add a
 * value here when a new screen needs to hand context to Tuto, no other
 * change required.
 */
export const AI_SCREENS = ["home", "podcast", "article", "quiz", "vocabulary", "daily-mission"] as const;
export const ScreenSchema = z.enum(AI_SCREENS);
export type Screen = z.infer<typeof ScreenSchema>;

/** A generic pointer to "whatever content is on screen" — no Podcast/Article coupling. */
export const ContentReferenceSchema = z.object({
  contentType: z.string(),
  id: z.string(),
  title: z.string(),
});
export type ContentReference = z.infer<typeof ContentReferenceSchema>;

export const LessonReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
});
export type LessonReference = z.infer<typeof LessonReferenceSchema>;

/**
 * The AI Context object (Sprint 1, Phase 4): everything Tuto might need to
 * know about what the learner is looking at and who they are, independent
 * of any specific feature. Every field is nullable and optional at the
 * call site — a caller sends only what it actually knows.
 */
export const LearningContextSchema = z.object({
  currentScreen: ScreenSchema.nullable().default(null),
  currentContent: ContentReferenceSchema.nullable().default(null),
  userLevel: CefrLevelSchema.nullable().default(null),
  /** Free-form on purpose — the AI module doesn't own the canonical goal list, the app does. */
  learningGoal: z.string().nullable().default(null),
  currentLesson: LessonReferenceSchema.nullable().default(null),
  selectedWord: z.string().nullable().default(null),
  selectedSentence: z.string().nullable().default(null),
  selectedParagraph: z.string().nullable().default(null),
});
export type LearningContext = z.infer<typeof LearningContextSchema>;
