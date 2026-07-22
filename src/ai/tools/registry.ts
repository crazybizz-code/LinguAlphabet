import type { ToolDefinition } from "./types";

/** Mirrors src/ai/providers/registry.ts's registerProvider()/getProvider() pattern. */
const tools = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

/** Every registered tool — this is what the AI Service hands to the provider as available tools, never a hardcoded list. */
export function listTools(): ToolDefinition[] {
  return [...tools.values()];
}
