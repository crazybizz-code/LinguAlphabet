import { z } from "zod";
import type { ToolDefinition } from "../types";
import { KnowledgeDomainSchema, TeachingAssetSchema, listTeachingAssets } from "@/ai/knowledge";

const AssetTypeSchema = z.enum(["miniExercise", "conversationPrompt", "writingPrompt", "listeningPrompt", "speakingPrompt"]);

const ArgsSchema = z.object({
  domain: KnowledgeDomainSchema.optional(),
  type: AssetTypeSchema.optional(),
  grammarUnitId: z.string().optional(),
  vocabularyWord: z.string().optional(),
});
type Args = z.infer<typeof ArgsSchema>;

const ResultSchema = z.object({ assets: z.array(TeachingAssetSchema) });
type Result = z.infer<typeof ResultSchema>;

/**
 * Sprint 9: browse LinguABC's reusable teaching assets — mini exercises,
 * conversation/writing/listening/speaking prompts — instead of Tuto
 * inventing a fresh exercise or prompt every time one would help. Filters
 * combine (all provided filters must match); omitting every filter
 * returns the whole library, which is small enough (Sprint 8: fifteen
 * assets) that this is a reasonable default rather than an error.
 *
 * `getGrammarUnit`'s own result already resolves that unit's exercises
 * directly — this tool is for the cases that aren't already tied to one
 * specific grammar unit call: a domain-wide browse ("give me a listening
 * exercise"), or an asset tied to a vocabulary word instead.
 */
export const getTeachingAssetsTool: ToolDefinition<Args, Result> = {
  name: "getTeachingAssets",
  description:
    "Browse LinguABC's reusable teaching assets (mini exercises, conversation/writing/listening/speaking prompts). Filter by domain, asset type, a related grammar unit id, or a related vocabulary word. Prefer an existing matching asset over inventing a new exercise or prompt from scratch.",
  parameters: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        enum: ["grammar", "vocabulary", "pronunciation", "listening", "reading", "writing", "speaking", "examPreparation"],
        description: "Restrict to assets in this knowledge domain.",
      },
      type: {
        type: "string",
        enum: ["miniExercise", "conversationPrompt", "writingPrompt", "listeningPrompt", "speakingPrompt"],
        description: "Restrict to this asset type.",
      },
      grammarUnitId: { type: "string", description: 'Restrict to assets related to this grammar unit id, e.g. "conditionals".' },
      vocabularyWord: { type: "string", description: "Restrict to assets related to this vocabulary word." },
    },
    required: [],
  },
  resultSchema: ResultSchema,
  async execute(args) {
    const parsed = ArgsSchema.parse(args ?? {});
    let assets = listTeachingAssets();

    if (parsed.domain) assets = assets.filter((asset) => asset.domain === parsed.domain);
    if (parsed.type) assets = assets.filter((asset) => asset.type === parsed.type);
    if (parsed.grammarUnitId) {
      assets = assets.filter((asset) => asset.relatedGrammarUnitIds.includes(parsed.grammarUnitId!));
    }
    if (parsed.vocabularyWord) {
      const normalized = parsed.vocabularyWord.trim().toLowerCase();
      assets = assets.filter((asset) => asset.relatedVocabularyWords.some((word) => word.toLowerCase() === normalized));
    }

    return { assets };
  },
};
