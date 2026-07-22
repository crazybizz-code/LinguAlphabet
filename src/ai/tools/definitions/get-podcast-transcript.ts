import { z } from "zod";
import type { ToolDefinition } from "../types";
import { MOCK_TRANSCRIPTS } from "../mock-data";

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

/** Transcript for whichever podcast is current (src/ai/context's currentPodcast) — mock data only. */
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

    const segments = MOCK_TRANSCRIPTS[ref.id];
    if (!segments) return { found: false, reason: `No transcript found for podcast id "${ref.id}".` };

    const parsedArgs = ArgsSchema.parse(args ?? {});
    const limited = parsedArgs.maxSegments ? segments.slice(0, parsedArgs.maxSegments) : segments;

    return { found: true, podcastId: ref.id, segments: limited };
  },
};
