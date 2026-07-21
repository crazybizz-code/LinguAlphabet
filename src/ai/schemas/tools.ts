import { z } from "zod";

/**
 * Shape of a tool's output once tool-calling exists (src/ai/tools is
 * scaffolding only today — no tool executes yet). Defined now so
 * AssistantMessage has a stable, typed place to carry results without a
 * breaking schema change later.
 */
export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  content: z.string(),
  isError: z.boolean().default(false),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;
