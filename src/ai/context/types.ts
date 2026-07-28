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
export const AI_SCREENS = ["home", "tuto", "podcast", "article", "quiz", "vocabulary", "daily-mission"] as const;
export const ScreenSchema = z.enum(AI_SCREENS);
export type Screen = z.infer<typeof ScreenSchema>;

/**
 * A generic {id, title} pointer, reused for every "what is the learner
 * currently on" field (lesson, previous lesson, podcast, article, quiz).
 * Deliberately just id+title — no transcript, no body, no quiz questions.
 * Reaching for that content is exactly the "podcast analysis"/"article
 * analysis" this sprint explicitly excludes.
 */
export const TitledReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
});
export type TitledReference = z.infer<typeof TitledReferenceSchema>;

/**
 * The AI Context object (Sprint 1 Phase 4, expanded in Sprint 2):
 * everything Tuto might need to know about what the learner is looking at,
 * doing, and who they are — independent of any specific feature. Every
 * field is nullable and optional at the call site; a caller sends only
 * what it actually knows, and buildLearningContext() (./builder.ts) fills
 * in the rest as null. Nothing here requires every field to be present.
 */
export const LearningContextSchema = z.object({
  currentScreen: ScreenSchema.nullable().default(null),
  /** Free-form, e.g. "reading the transcript", "answering question 3 of 5" — the caller knows best; this module doesn't validate its vocabulary. */
  currentActivity: z.string().nullable().default(null),

  currentLesson: TitledReferenceSchema.nullable().default(null),
  previousLesson: TitledReferenceSchema.nullable().default(null),
  currentPodcast: TitledReferenceSchema.nullable().default(null),
  currentArticle: TitledReferenceSchema.nullable().default(null),
  currentQuiz: TitledReferenceSchema.nullable().default(null),

  selectedWord: z.string().nullable().default(null),
  selectedSentence: z.string().nullable().default(null),
  selectedParagraph: z.string().nullable().default(null),
  /** Seconds into the current podcast/article audio, if the learner has one playing. */
  transcriptTimestamp: z.number().nonnegative().nullable().default(null),

  userLevel: CefrLevelSchema.nullable().default(null),
  /** Free-form on purpose — the AI module doesn't own the canonical goal list, the app does. */
  learningGoal: z.string().nullable().default(null),
  streak: z.number().int().nonnegative().nullable().default(null),
  xp: z.number().int().nonnegative().nullable().default(null),
});
export type LearningContext = z.infer<typeof LearningContextSchema>;
