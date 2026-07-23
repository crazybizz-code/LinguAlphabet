import { z } from "zod";
import { CefrLevelSchema } from "@/ai/context";

/**
 * Every capability the brief asked for, nested under one vocabulary item
 * so the UI can render a single "word card" from one object.
 */
const VocabularyItemSchema = z.object({
  word: z.string(),
  partOfSpeech: z.string(),
  /** null when the model genuinely can't place a level — never fabricated. */
  cefrLevel: CefrLevelSchema.nullable(),
  meaning: z.string(),
  simpleExplanation: z.string(),
  uzbekTranslation: z.string(),
  /** Phonetic/IPA-style guidance, e.g. "/ˈrek.ən/" or "REK-uhn" — whichever the model finds clearer. */
  pronunciation: z.string(),
  collocations: z.array(z.string()),
  synonyms: z.array(z.string()),
  antonyms: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  memoryTips: z.array(z.string()),
});

const ExampleSchema = z.object({
  sentence: z.string(),
  /** Optional short note on why this example is useful (register, context, etc.) — not required for every example. */
  note: z.string().optional(),
});

/**
 * The structured response contract (Sprint 4): everything the UI needs to
 * extract, one field per bullet in the brief's "Response Format" section.
 * Enforced two ways — as the JSON Schema sent to the provider via
 * generateStructuredResponse() (src/ai/services/ai-service.ts), and
 * re-validated against this same schema after parsing, so a caller can
 * trust the shape without re-checking it.
 */
export const VocabularyExplanationSchema = z.object({
  vocabularyItem: VocabularyItemSchema,
  examples: z.array(ExampleSchema).min(1),
  grammarNotes: z.array(z.string()),
  followUpPractice: z.string(),
  suggestedNextAction: z.string(),
});
export type VocabularyExplanation = z.infer<typeof VocabularyExplanationSchema>;
