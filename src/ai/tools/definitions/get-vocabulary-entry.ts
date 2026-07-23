import { z } from "zod";
import type { ToolDefinition } from "../types";
import { KnowledgeVocabularyEntrySchema, getVocabularyEntry } from "@/ai/knowledge";

const ArgsSchema = z.object({
  word: z.string(),
});
type Args = z.infer<typeof ArgsSchema>;

const ResultSchema = z.union([
  z.object({ found: z.literal(true), entry: KnowledgeVocabularyEntrySchema }),
  z.object({ found: z.literal(false), reason: z.string() }),
]);
type Result = z.infer<typeof ResultSchema>;

/**
 * Sprint 9: the curated counterpart to Sprint 3's getSelectedVocabulary
 * tool. That tool only ever looks up whatever word is *currently
 * selected* in the learner context, against the older
 * src/ai/tools/mock-data.ts dictionary; this one lets the model look up
 * *any* word by name (e.g. one mentioned mid-conversation, not selected)
 * against src/ai/knowledge's curated entries — deliberately a separate
 * tool over separate data, not a rewrite of the existing one.
 */
export const getVocabularyEntryTool: ToolDefinition<Args, Result> = {
  name: "getVocabularyEntry",
  description:
    "Look up a word in LinguABC's curated vocabulary knowledge base. Always call this before explaining a word's meaning, collocations, or examples from general knowledge — prefer its examples over inventing new ones when it has any.",
  parameters: {
    type: "object",
    properties: { word: { type: "string", description: 'The word to look up, e.g. "reckon".' } },
    required: ["word"],
  },
  resultSchema: ResultSchema,
  async execute(args) {
    const { word } = ArgsSchema.parse(args ?? {});
    const entry = getVocabularyEntry(word);
    if (!entry) return { found: false, reason: `"${word}" is not in LinguABC's curated vocabulary knowledge base.` };
    return { found: true, entry };
  },
};
