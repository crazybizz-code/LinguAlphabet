/**
 * Scaffolding only — no concrete tool is registered yet (Sprint 1 rule: no
 * feature creep). This defines the shape a future tool must have so the
 * AI Service's tool-calling loop, once built, has a stable contract to
 * code against instead of inventing one ad hoc per tool.
 */
export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  /** JSON Schema describing TArgs, in the shape the active provider's function-calling API expects. */
  parameters: unknown;
  execute(args: TArgs): Promise<TResult>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}
