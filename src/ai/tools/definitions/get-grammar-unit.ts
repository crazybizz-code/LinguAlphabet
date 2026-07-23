import { z } from "zod";
import type { ToolDefinition } from "../types";
import { GrammarUnitSchema, TeachingAssetSchema, listGrammarUnits, getExercisesForGrammarUnit } from "@/ai/knowledge";

const ArgsSchema = z.object({
  topic: z.string(),
});
type Args = z.infer<typeof ArgsSchema>;

const ResultSchema = z.union([
  z.object({ found: z.literal(true), unit: GrammarUnitSchema, exercises: z.array(TeachingAssetSchema) }),
  z.object({ found: z.literal(false), reason: z.string(), availableTopics: z.array(z.string()) }),
]);
type Result = z.infer<typeof ResultSchema>;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Sprint 9 (Knowledge Integration): the first thing Tuto should reach for
 * before explaining a grammar rule from general model knowledge — see
 * the "Knowledge base" prompt section (src/ai/prompts/tuto/sections.ts).
 * Matches loosely on purpose (exact id, exact title, or a substring of
 * either) since there are only six units today and the model's phrasing
 * of a topic won't always match the id exactly — this is plain string
 * matching over a small fixed list, not semantic search.
 *
 * The result embeds the unit's exercises already resolved (not just
 * `exerciseIds`) so a single call gives Tuto everything it needs to both
 * explain the rule and offer practice, without a second tool round trip.
 */
export const getGrammarUnitTool: ToolDefinition<Args, Result> = {
  name: "getGrammarUnit",
  description:
    'Look up a LinguABC grammar unit (e.g. "present perfect", "conditionals", "passive voice") from the internal knowledge base. Always call this before explaining a grammar topic — LinguABC teaches these consistently, and this returns the exact explanation, common mistakes, examples, and exercises to build the answer from.',
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: 'The grammar topic the learner is asking about, e.g. "present perfect".' },
    },
    required: ["topic"],
  },
  resultSchema: ResultSchema,
  async execute(args) {
    const { topic } = ArgsSchema.parse(args ?? {});
    const units = listGrammarUnits();
    const normalizedTopic = normalize(topic);

    const unit =
      units.find((candidate) => candidate.id === normalizedTopic) ??
      units.find((candidate) => normalize(candidate.title) === normalizedTopic) ??
      units.find(
        (candidate) => normalize(candidate.title).includes(normalizedTopic) || normalizedTopic.includes(normalize(candidate.title)),
      );

    if (!unit) {
      return {
        found: false,
        reason: `No LinguABC grammar unit matches "${topic}".`,
        availableTopics: units.map((candidate) => candidate.title),
      };
    }

    return { found: true, unit, exercises: getExercisesForGrammarUnit(unit.id) };
  },
};
