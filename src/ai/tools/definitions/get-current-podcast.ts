import { z } from "zod";
import type { ToolDefinition } from "../types";

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
 * (src/ai/context) — the model never supplies or guesses an id. Reads
 * through the request's ContentRepository (src/ai/data).
 */
export const getCurrentPodcastTool: ToolDefinition<Record<string, never>, Result> = {
  name: "getCurrentPodcast",
  description: "Get metadata about the podcast the learner is currently studying, if any.",
  parameters: { type: "object", properties: {}, required: [] },
  resultSchema: ResultSchema,
  async execute(_args, context) {
    const ref = context.learningContext.currentPodcast;
    if (!ref) return { found: false, reason: "The learner is not currently viewing a podcast." };
    if (!context.contentRepository) return { found: false, reason: "Content access is not available right now." };

    const podcast = await context.contentRepository.getPodcast(ref.id);
    if (!podcast) return { found: false, reason: `No podcast data found for id "${ref.id}".` };

    return { found: true, podcast };
  },
};
