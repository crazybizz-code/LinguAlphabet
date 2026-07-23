import { z } from "zod";
import { CefrLevelSchema } from "@/ai/context";

/**
 * Sprint 10 (Learner Intelligence): the structured model of a learner
 * that every future personalization feature (memory, daily plans,
 * spaced repetition, recommendations) will read from — designed now,
 * consumed later. Deliberately self-contained like src/ai/knowledge:
 * only `CefrLevelSchema` is shared with src/ai/context, the same reuse
 * already established there.
 */

/**
 * A closed but small set on purpose — a v1 classification, not a final
 * taxonomy. Extending it later (e.g. adding "kinesthetic") is additive,
 * not a breaking change to anything that reads a `LearnerProfile`.
 */
export const PREFERRED_LEARNING_STYLES = [
  "visual",
  "conversational",
  "structured",
  "reading-focused",
  "practice-heavy",
] as const;
export const PreferredLearningStyleSchema = z.enum(PREFERRED_LEARNING_STYLES);
export type PreferredLearningStyle = z.infer<typeof PreferredLearningStyleSchema>;

/**
 * "needs-more-repetition" rather than "slow" — Sprint 7's
 * ENCOURAGEMENT_STYLE rule ("never condescending") applies to how the AI
 * module itself labels a learner internally, not just what it says to
 * them out loud.
 */
export const LEARNING_PACES = ["fast", "steady", "needs-more-repetition"] as const;
export const LearningPaceSchema = z.enum(LEARNING_PACES);
export type LearningPace = z.infer<typeof LearningPaceSchema>;

export const StudyConsistencySchema = z.object({
  studyDaysLast30: z.number().int().nonnegative().nullable().default(null),
  averageSessionMinutes: z.number().nonnegative().nullable().default(null),
  longestStreak: z.number().int().nonnegative().nullable().default(null),
});
export type StudyConsistency = z.infer<typeof StudyConsistencySchema>;

/**
 * The Learner Profile (Sprint 10): a compact, personalization-ready
 * snapshot of who a learner is and how they're doing — not an event log
 * (see ./performance.ts for that). Every field mirrors
 * `LearningContextSchema`'s own pattern (src/ai/context/types.ts):
 * nullable, defaulted, independent of every other field, so a caller
 * populates only what it actually knows and nothing here is ever
 * fabricated.
 *
 * `strongGrammarTopics`/`weakGrammarTopics`/`recentlyStudiedTopics` are
 * plain strings, not a typed reference into `src/ai/knowledge`'s
 * `GRAMMAR_UNITS` — deliberately loose today so this module doesn't
 * depend on that one, but expected to line up with real `GrammarUnit`
 * ids (e.g. "present-perfect") once a real profile store populates them
 * from actual lesson history, which is exactly what makes future
 * integration with the Knowledge Base (Sprint 8/9) straightforward.
 */
export const LearnerProfileSchema = z.object({
  id: z.string(),

  cefrLevel: CefrLevelSchema.nullable().default(null),
  /** Free-form on purpose, same reasoning as LearningContext's own learningGoal — this module doesn't own the canonical goal list. */
  learningGoal: z.string().nullable().default(null),
  /** The learner's native language — a backend personalization signal (e.g. which language to translate into), not a product-level target-language selection screen; LinguABC remains English-only in its UI (CLAUDE.md). */
  nativeLanguage: z.string().nullable().default(null),

  strongGrammarTopics: z.array(z.string()).default([]),
  weakGrammarTopics: z.array(z.string()).default([]),
  strongVocabularyAreas: z.array(z.string()).default([]),
  weakVocabularyAreas: z.array(z.string()).default([]),
  recentlyStudiedTopics: z.array(z.string()).default([]),
  /** Short, human-readable summaries — a rolling digest a real implementation would derive from recent PerformanceRecords (./performance.ts), not a duplicate of that detailed log. */
  recentMistakes: z.array(z.string()).default([]),

  preferredLearningStyle: PreferredLearningStyleSchema.nullable().default(null),
  learningPace: LearningPaceSchema.nullable().default(null),

  streak: z.number().int().nonnegative().nullable().default(null),
  xp: z.number().int().nonnegative().nullable().default(null),
  studyConsistency: StudyConsistencySchema.nullable().default(null),
});
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;
