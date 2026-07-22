import type { ZodType } from "zod";
import type { LearningContext } from "@/ai/context";

/**
 * Ambient state every tool execution gets alongside the model-supplied
 * arguments — this is how a `getCurrentPodcast()` tool knows *which*
 * podcast without the model having to guess or pass an id. The model only
 * ever supplies `TArgs`; the AI Service supplies `ToolExecutionContext`
 * from the request's own LearningContext (src/ai/context).
 */
export interface ToolExecutionContext {
  learningContext: LearningContext;
}

/**
 * The common interface every tool implements (Sprint 3). `parameters` is
 * a JSON Schema for `TArgs` in the provider's function-calling format.
 * `resultSchema`, when present, is enforced by the execution layer
 * (src/ai/tools/execute.ts) before a result is ever sent back to the
 * model — the mechanism behind "every tool returns typed JSON, never
 * plain text."
 */
export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  parameters: unknown;
  resultSchema?: ZodType<TResult>;
  execute(args: TArgs, context: ToolExecutionContext): Promise<TResult>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}
