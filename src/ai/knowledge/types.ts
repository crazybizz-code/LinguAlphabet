import { z } from "zod";
import { CefrLevelSchema } from "@/ai/context";

/**
 * Sprint 8 (Tuto Knowledge Base): the eight subject areas Tuto teaches.
 * "examPreparation" deliberately mirrors the product's own generic
 * "Exam Preparation" goal (CLAUDE.md — it represents all English exams,
 * never one specific test), not a specific exam brand.
 */
export const KNOWLEDGE_DOMAINS = [
  "grammar",
  "vocabulary",
  "pronunciation",
  "listening",
  "reading",
  "writing",
  "speaking",
  "examPreparation",
] as const;
export const KnowledgeDomainSchema = z.enum(KNOWLEDGE_DOMAINS);
export type KnowledgeDomain = z.infer<typeof KnowledgeDomainSchema>;

/** A single usage example, reused by both grammar units and vocabulary entries. */
export const KnowledgeExampleSchema = z.object({
  sentence: z.string(),
  /** Optional note on why this example is useful — register, context, what it's contrasting with. */
  note: z.string().optional(),
});
export type KnowledgeExample = z.infer<typeof KnowledgeExampleSchema>;

/**
 * A reusable grammar unit — content Tuto teaches *from* instead of
 * re-deriving an explanation from scratch every time the same rule comes
 * up. `exerciseIds` and `relatedGrammarUnitIds` point at other records in
 * this same knowledge base (./assets.ts, this file) rather than embedding
 * copies, so one exercise or related-unit link can be reused everywhere
 * it's relevant.
 */
export const GrammarUnitSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** The levels this unit is actually taught/relevant at — not every grammar unit fits every level. */
  cefrLevels: z.array(CefrLevelSchema).min(1),
  explanation: z.string(),
  commonMistakes: z.array(z.string()),
  examples: z.array(KnowledgeExampleSchema).min(1),
  /** IDs into TEACHING_ASSETS (./assets.ts) — the reusable exercises for this unit, not copies of them. */
  exerciseIds: z.array(z.string()),
  /** Things Tuto could naturally do next after teaching this — feeds Sprint 7's follow-up-learning guidance with concrete, unit-specific options instead of a generic nudge. */
  followUpSuggestions: z.array(z.string()),
  /** IDs of other grammar units this one is commonly confused with or naturally follows. */
  relatedGrammarUnitIds: z.array(z.string()),
});
export type GrammarUnit = z.infer<typeof GrammarUnitSchema>;

/**
 * A reusable vocabulary entry — the same shape Vocabulary Intelligence
 * (Sprint 4) generates on demand for an arbitrary word, but here as
 * curated, consistent source content for words LinguABC teaches
 * deliberately, so two learners asking about the same word get the same
 * grounded answer instead of two independently-generated ones.
 */
export const KnowledgeVocabularyEntrySchema = z.object({
  word: z.string(),
  partOfSpeech: z.string(),
  meaning: z.string(),
  cefrLevel: CefrLevelSchema,
  collocations: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  synonyms: z.array(z.string()),
  antonyms: z.array(z.string()),
  examples: z.array(KnowledgeExampleSchema).min(1),
});
export type KnowledgeVocabularyEntry = z.infer<typeof KnowledgeVocabularyEntrySchema>;

/**
 * Fields every teaching asset shares, regardless of type. `relatedGrammarUnitIds`/
 * `relatedVocabularyWords` are the back-half of GrammarUnit.exerciseIds —
 * an asset knows what it's for, a unit knows which assets serve it, so
 * either side can be looked up from the other (see ./registry.ts).
 */
const TeachingAssetBaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: KnowledgeDomainSchema,
  cefrLevels: z.array(CefrLevelSchema).min(1),
  prompt: z.string(),
  relatedGrammarUnitIds: z.array(z.string()).default([]),
  relatedVocabularyWords: z.array(z.string()).default([]),
});

export const MiniExerciseSchema = TeachingAssetBaseSchema.extend({
  type: z.literal("miniExercise"),
  /** The expected answer, when there is a single correct one — omitted for open-ended exercises. */
  answer: z.string().optional(),
});
export type MiniExercise = z.infer<typeof MiniExerciseSchema>;

export const ConversationPromptSchema = TeachingAssetBaseSchema.extend({
  type: z.literal("conversationPrompt"),
  followUpQuestions: z.array(z.string()).default([]),
});
export type ConversationPrompt = z.infer<typeof ConversationPromptSchema>;

export const WritingPromptSchema = TeachingAssetBaseSchema.extend({
  type: z.literal("writingPrompt"),
  /** How the response should be structured — a paragraph plan, not a grading rubric. */
  structureGuidance: z.string().optional(),
});
export type WritingPrompt = z.infer<typeof WritingPromptSchema>;

export const ListeningPromptSchema = TeachingAssetBaseSchema.extend({
  type: z.literal("listeningPrompt"),
  /** The specific listening skill this exercises, e.g. "connected speech", "note-taking". */
  focusSkill: z.string().optional(),
});
export type ListeningPrompt = z.infer<typeof ListeningPromptSchema>;

export const SpeakingPromptSchema = TeachingAssetBaseSchema.extend({
  type: z.literal("speakingPrompt"),
  followUpQuestions: z.array(z.string()).default([]),
});
export type SpeakingPrompt = z.infer<typeof SpeakingPromptSchema>;

/**
 * Every reusable teaching asset, discriminated by `type` — the content
 * counterpart to Sprint 7's FOLLOW_UP_LEARNING guidance (a follow-up
 * question, a mini-exercise, a new word, an activity nudge): these are
 * where that follow-up would actually come *from*, once this knowledge
 * base is wired into a feature, instead of the model inventing one fresh
 * each time.
 */
export const TeachingAssetSchema = z.discriminatedUnion("type", [
  MiniExerciseSchema,
  ConversationPromptSchema,
  WritingPromptSchema,
  ListeningPromptSchema,
  SpeakingPromptSchema,
]);
export type TeachingAsset = z.infer<typeof TeachingAssetSchema>;
