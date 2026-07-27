import { z } from "zod";
import type { ToolDefinition } from "../types";

const ArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  cefrLevel: z.string(),
  readingTimeMinutes: z.number(),
  topics: z.array(z.string()),
});

const ResultSchema = z.union([
  z.object({ found: z.literal(true), article: ArticleSchema }),
  z.object({ found: z.literal(false), reason: z.string() }),
]);
type Result = z.infer<typeof ResultSchema>;

/** Reads real content via the request's ContentRepository (src/ai/data) — mirrors get-current-podcast.ts exactly. */
export const getCurrentArticleTool: ToolDefinition<Record<string, never>, Result> = {
  name: "getCurrentArticle",
  description: "Get metadata about the article the learner is currently studying, if any.",
  parameters: { type: "object", properties: {}, required: [] },
  resultSchema: ResultSchema,
  async execute(_args, context) {
    const ref = context.learningContext.currentArticle;
    if (!ref) return { found: false, reason: "The learner is not currently viewing an article." };
    if (!context.dependencies?.contentRepository) return { found: false, reason: "Content access is not available right now." };

    const article = await context.dependencies.contentRepository.getArticle(ref.id);
    if (!article) return { found: false, reason: `No article data found for id "${ref.id}".` };

    return { found: true, article };
  },
};
