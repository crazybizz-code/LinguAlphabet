import { z } from "zod";
import type { ToolDefinition } from "../types";
import { GrammarUnitSchema, getGrammarUnit, type GrammarUnit } from "@/ai/knowledge";

const ArgsSchema = z.object({
  grammarUnitId: z.string(),
});
type Args = z.infer<typeof ArgsSchema>;

const ResultSchema = z.union([
  z.object({ found: z.literal(true), unitId: z.string(), related: z.array(GrammarUnitSchema) }),
  z.object({ found: z.literal(false), reason: z.string() }),
]);
type Result = z.infer<typeof ResultSchema>;

/**
 * Sprint 9: resolves a grammar unit's `relatedGrammarUnitIds` into the
 * actual related units — useful once a learner has a rule down and Tuto
 * wants to naturally connect it to what's commonly confused with it or
 * comes next (e.g. Present Perfect → Reported Speech), using
 * `getGrammarUnit`'s own `unit.id` as the argument here.
 */
export const getRelatedGrammarTool: ToolDefinition<Args, Result> = {
  name: "getRelatedGrammar",
  description:
    "Get the LinguABC grammar units commonly related to, confused with, or a natural next step from a given grammar unit (use the unit id returned by getGrammarUnit).",
  parameters: {
    type: "object",
    properties: {
      grammarUnitId: { type: "string", description: 'The grammar unit id to find related units for, e.g. "present-perfect".' },
    },
    required: ["grammarUnitId"],
  },
  resultSchema: ResultSchema,
  async execute(args) {
    const { grammarUnitId } = ArgsSchema.parse(args ?? {});
    const unit = getGrammarUnit(grammarUnitId);
    if (!unit) return { found: false, reason: `No LinguABC grammar unit found for id "${grammarUnitId}".` };

    const related = unit.relatedGrammarUnitIds
      .map((relatedId) => getGrammarUnit(relatedId))
      .filter((candidate): candidate is GrammarUnit => candidate != null);

    return { found: true, unitId: unit.id, related };
  },
};
