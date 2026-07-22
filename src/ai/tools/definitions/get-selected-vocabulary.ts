import { z } from "zod";
import type { ToolDefinition } from "../types";
import { MOCK_VOCABULARY } from "../mock-data";

const EntrySchema = z.object({
  word: z.string(),
  partOfSpeech: z.string(),
  definition: z.string(),
  exampleSentence: z.string(),
  cefrLevel: z.string(),
});

const ResultSchema = z.union([
  z.object({ found: z.literal(true), entry: EntrySchema }),
  z.object({ found: z.literal(false), reason: z.string() }),
]);
type Result = z.infer<typeof ResultSchema>;

/** Looks up whichever word is selected (src/ai/context's selectedWord) — mock dictionary only. */
export const getSelectedVocabularyTool: ToolDefinition<Record<string, never>, Result> = {
  name: "getSelectedVocabulary",
  description: "Get the definition and example usage of the word the learner currently has selected, if any.",
  parameters: { type: "object", properties: {}, required: [] },
  resultSchema: ResultSchema,
  async execute(_args, context) {
    const word = context.learningContext.selectedWord;
    if (!word) return { found: false, reason: "The learner hasn't selected a word." };

    const entry = MOCK_VOCABULARY[word.toLowerCase().trim()];
    if (!entry) return { found: false, reason: `No vocabulary entry found for "${word}".` };

    return { found: true, entry };
  },
};
