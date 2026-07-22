import { z } from "zod";
import type { ToolDefinition } from "../types";
import { MOCK_ARTICLES } from "../mock-data";

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

/** Mirrors get-current-podcast.ts exactly, for the article content type. Mock data only. */
export const getCurrentArticleTool: ToolDefinition<Record<string, never>, Result> = {
  name: "getCurrentArticle",
  description: "Get metadata about the article the learner is currently studying, if any.",
  parameters: { type: "object", properties: {}, required: [] },
  resultSchema: ResultSchema,
  async execute(_args, context) {
    const ref = context.learningContext.currentArticle;
    if (!ref) return { found: false, reason: "The learner is not currently viewing an article." };

    const article = MOCK_ARTICLES[ref.id];
    if (!article) return { found: false, reason: `No article data found for id "${ref.id}".` };

    return { found: true, article };
  },
};
