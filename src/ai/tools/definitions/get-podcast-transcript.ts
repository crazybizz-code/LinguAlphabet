import { z } from "zod";
import type { ToolDefinition } from "../types";

const SegmentSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  timestampSeconds: z.number(),
});

const ResultSchema = z.union([
  z.object({ found: z.literal(true), podcastId: z.string(), segments: z.array(SegmentSchema) }),
  z.object({ found: z.literal(false), reason: z.string() }),
]);
type Result = z.infer<typeof ResultSchema>;

const ArgsSchema = z.object({
  maxSegments: z.number().int().positive().optional(),
});
type Args = z.infer<typeof ArgsSchema>;

/** Transcript for whichever podcast is current (src/ai/context's currentPodcast) — reads through the request's ContentRepository (src/ai/data). */
export const getPodcastTranscriptTool: ToolDefinition<Args, Result> = {
  name: "getPodcastTranscript",
  description: "Get the transcript of the podcast the learner is currently studying, optionally limited to the first N segments.",
  parameters: {
    type: "object",
    properties: {
      maxSegments: { type: "number", description: "Maximum number of transcript segments to return." },
    },
    required: [],
  },
  resultSchema: ResultSchema,
  async execute(args, context) {
    const ref = context.learningContext.currentPodcast;
    if (!ref) return { found: false, reason: "The learner is not currently viewing a podcast." };
    if (!context.contentRepository) return { found: false, reason: "Content access is not available right now." };

    const parsedArgs = ArgsSchema.parse(args ?? {});
    const segments = await context.contentRepository.getPodcastTranscript(ref.id, parsedArgs.maxSegments);
    if (!segments) return { found: false, reason: `No transcript found for podcast id "${ref.id}".` };

    return { found: true, podcastId: ref.id, segments };
  },
};
