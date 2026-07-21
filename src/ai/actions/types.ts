/**
 * Scaffolding only — no concrete action exists yet. An Action is distinct
 * from a Tool (src/ai/tools): a tool returns information, an action
 * changes app state on the learner's behalf (e.g. marking a lesson
 * complete, navigating to a screen). See docs/ai-architecture.md.
 */
export interface ActionDefinition<TArgs = unknown> {
  name: string;
  description: string;
  execute(args: TArgs): Promise<{ success: boolean; message: string }>;
}
