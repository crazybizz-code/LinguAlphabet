import type { ZodType } from "zod";
import { z } from "zod";
import { getDefaultProvider, AIProviderError } from "@/ai/providers";
import type { AIProviderMessage } from "@/ai/providers";
import { buildTutoSystemPrompt } from "@/ai/prompts";
import { buildLearningContext } from "@/ai/context";
import type { LearningContext } from "@/ai/context";
import type { AssistantMessage, ConversationMessage, ToolResult } from "@/ai/schemas";
import { listTools, bootstrapTools } from "@/ai/tools";
import { runToolLoop } from "./tool-loop";

export interface GenerateResponseInput {
  /** User/assistant turns only — a client-supplied "system" message is rejected before this point (src/app/api/ai/chat). */
  messages: ConversationMessage[];
  learningContext?: LearningContext | null;
}

function toProviderMessages(input: GenerateResponseInput): AIProviderMessage[] {
  const systemPrompt = buildTutoSystemPrompt(input.learningContext);

  const history: AIProviderMessage[] = input.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role, content: message.content }));

  return [{ role: "system", content: systemPrompt }, ...history];
}

function toToolResults(loopToolResults: Awaited<ReturnType<typeof runToolLoop>>["toolResults"]): ToolResult[] | undefined {
  if (loopToolResults.length === 0) return undefined;
  return loopToolResults.map((executed) => ({
    toolCallId: executed.toolCallId,
    toolName: executed.toolName,
    content: JSON.stringify(executed.result),
    isError: executed.isError,
  }));
}

/**
 * The single entry point for talking to an AI provider (Sprint 1, Phase 6;
 * tool-calling added in Sprint 3). Nothing outside src/ai — not a Client
 * Component, not another route — should ever import from src/ai/providers
 * or src/ai/tools directly; everything goes through generateResponse()/
 * streamResponse()/generateStructuredResponse() so the provider, the
 * system prompt, the context wiring, and the tool loop can all change
 * without touching a caller.
 */
export async function generateResponse(input: GenerateResponseInput): Promise<AssistantMessage> {
  const provider = getDefaultProvider();
  const learningContext = input.learningContext ?? buildLearningContext();
  const { completion, toolResults } = await runToolLoop(provider, toProviderMessages(input), learningContext);

  return { role: "assistant", content: completion.content, toolResults: toToolResults(toolResults) };
}

/**
 * Streaming counterpart. With no tools registered, this streams text
 * deltas exactly as Sprint 1/2 did. Once any tool is registered (true
 * from Sprint 3 on, since src/ai/tools/bootstrap.ts always registers the
 * six built-in tools), a request runs the full tool loop first — which is
 * non-streaming, a tool call must be fully assembled before it can be
 * executed — and yields its final answer as a single chunk. See
 * docs/ai-architecture.md's "Streaming + tools" note for this tradeoff.
 */
export async function* streamResponse(input: GenerateResponseInput): AsyncGenerator<string> {
  const provider = getDefaultProvider();
  bootstrapTools();

  if (listTools().length === 0) {
    for await (const chunk of provider.stream({ messages: toProviderMessages(input) })) {
      if (chunk.delta) yield chunk.delta;
    }
    return;
  }

  const learningContext = input.learningContext ?? buildLearningContext();
  const { completion } = await runToolLoop(provider, toProviderMessages(input), learningContext);
  if (completion.content) yield completion.content;
}

export interface GenerateStructuredResponseInput<T> extends GenerateResponseInput {
  /** A short stable identifier for this response shape, sent to the provider as the JSON Schema's name (e.g. "vocabulary_explanation"). */
  responseFormatName: string;
  resultSchema: ZodType<T>;
}

/**
 * Structured-output counterpart to generateResponse() (Sprint 4): derives
 * a JSON Schema from `resultSchema` (via `z.toJSONSchema()`) and asks the
 * provider to constrain its final answer to it, then re-validates the
 * parsed JSON against that same Zod schema before returning — defense in
 * depth, since OpenRouter fans a request out to many different underlying
 * models and not all of them honor strict JSON Schema mode equally well.
 * Still runs the full tool loop exactly like generateResponse() — a
 * structured-output request can still call a tool first to ground its
 * answer in real data before formatting the final JSON.
 */
export async function generateStructuredResponse<T>(input: GenerateStructuredResponseInput<T>): Promise<T> {
  const provider = getDefaultProvider();
  const learningContext = input.learningContext ?? buildLearningContext();
  const responseFormat = { name: input.responseFormatName, schema: z.toJSONSchema(input.resultSchema) };

  const { completion } = await runToolLoop(provider, toProviderMessages(input), learningContext, { responseFormat });

  let parsed: unknown;
  try {
    parsed = JSON.parse(completion.content);
  } catch {
    throw new AIProviderError("The AI did not return valid JSON for a structured response.", 502, true);
  }

  const result = input.resultSchema.safeParse(parsed);
  if (!result.success) {
    throw new AIProviderError(`The AI's structured response didn't match the expected shape: ${result.error.message}`, 502, true);
  }

  return result.data;
}
