import { z } from "zod";
import type { ToolDefinition } from "../types";
import { MOCK_PODCASTS } from "../mock-data";

const PodcastSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  cefrLevel: z.string(),
  durationSeconds: z.number(),
  topics: z.array(z.string()),
});

const ResultSchema = z.union([
  z.object({ found: z.literal(true), podcast: PodcastSchema }),
  z.object({ found: z.literal(false), reason: z.string() }),
]);
type Result = z.infer<typeof ResultSchema>;

/**
 * Reads which podcast is current from the request's LearningContext
 * (src/ai/context) — the model never supplies or guesses an id. Mock
 * data only (src/ai/tools/mock-data.ts); a real implementation swaps the
 * MOCK_PODCASTS lookup for a Supabase query (docs/ai-architecture.md).
 */
export const getCurrentPodcastTool: ToolDefinition<Record<string, never>, Result> = {
  name: "getCurrentPodcast",
  description: "Get metadata about the podcast the learner is currently studying, if any.",
  parameters: { type: "object", properties: {}, required: [] },
  resultSchema: ResultSchema,
  async execute(_args, context) {
    const ref = context.learningContext.currentPodcast;
    if (!ref) return { found: false, reason: "The learner is not currently viewing a podcast." };

    const podcast = MOCK_PODCASTS[ref.id];
    if (!podcast) return { found: false, reason: `No podcast data found for id "${ref.id}".` };

    return { found: true, podcast };
  },
};
