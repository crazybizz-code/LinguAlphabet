import type { AIProviderToolCall } from "@/ai/providers";
import { getTool } from "./registry";
import type { ToolExecutionContext } from "./types";

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  /** Always structured JSON — an object, never a bare string. */
  result: unknown;
  isError: boolean;
}

/**
 * The execution layer (Sprint 3): Tool Selection → Execute Tool → Return
 * Structured Result. Never throws — an unknown tool, invalid arguments,
 * or a tool that throws all become a `{ isError: true, result: {...} }`
 * the model can react to, instead of crashing the conversation.
 *
 * When a tool declares `resultSchema`, its output is parsed against it
 * here before being handed back — the one place "never plain text" is
 * actually enforced, rather than trusted per-tool.
 */
export async function executeToolCall(call: AIProviderToolCall, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const tool = getTool(call.name);
  if (!tool) {
    return { toolCallId: call.id, toolName: call.name, isError: true, result: { error: `Unknown tool "${call.name}".` } };
  }

  let args: unknown;
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch {
    return { toolCallId: call.id, toolName: call.name, isError: true, result: { error: "Tool arguments were not valid JSON." } };
  }

  try {
    const rawResult = await tool.execute(args, context);
    const result = tool.resultSchema ? tool.resultSchema.parse(rawResult) : rawResult;
    return { toolCallId: call.id, toolName: call.name, isError: false, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool execution failed.";
    return { toolCallId: call.id, toolName: call.name, isError: true, result: { error: message } };
  }
}
