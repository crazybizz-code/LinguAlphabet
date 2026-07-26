import { z } from "zod";
import type { ToolDefinition } from "../types";

const ResultSchema = z.union([
  z.object({ found: z.literal(true), articleId: z.string(), paragraphs: z.array(z.string()) }),
  z.object({ found: z.literal(false), reason: z.string() }),
]);
type Result = z.infer<typeof ResultSchema>;

const ArgsSchema = z.object({
  maxParagraphs: z.number().int().positive().optional(),
});
type Args = z.infer<typeof ArgsSchema>;

/**
 * Body text for whichever article is current (src/ai/context's
 * currentArticle) — the article counterpart to getPodcastTranscript, same
 * shape and reasoning. getCurrentArticle only ever returns metadata
 * (title/description/level); this is the tool anything that needs the
 * actual text (summarizing, generating questions) depends on. Reads
 * through the request's ContentRepository (src/ai/data).
 */
export const getArticleParagraphsTool: ToolDefinition<Args, Result> = {
  name: "getArticleParagraphs",
  description: "Get the body text of the article the learner is currently studying, as an ordered list of paragraphs, optionally limited to the first N.",
  parameters: {
    type: "object",
    properties: {
      maxParagraphs: { type: "number", description: "Maximum number of paragraphs to return." },
    },
    required: [],
  },
  resultSchema: ResultSchema,
  async execute(args, context) {
    const ref = context.learningContext.currentArticle;
    if (!ref) return { found: false, reason: "The learner is not currently viewing an article." };
    if (!context.contentRepository) return { found: false, reason: "Content access is not available right now." };

    const parsedArgs = ArgsSchema.parse(args ?? {});
    const paragraphs = await context.contentRepository.getArticleParagraphs(ref.id, parsedArgs.maxParagraphs);
    if (!paragraphs) return { found: false, reason: `No article body found for id "${ref.id}".` };

    return { found: true, articleId: ref.id, paragraphs };
  },
};
