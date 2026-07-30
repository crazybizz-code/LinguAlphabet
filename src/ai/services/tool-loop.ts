import type {
  AIProvider,
  AIProviderMessage,
  AIProviderResponseFormat,
  AIProviderToolSpec,
  AIProviderCompletionResult,
} from "@/ai/providers";
import { listTools, executeToolCall, bootstrapTools, type ToolExecutionContext, type ToolExecutionResult } from "@/ai/tools";
import type { LearningContext } from "@/ai/context";
import type { AIDependencies } from "@/ai/data";
import { fitToolResultToBudget, getToolLoopTokenBudget, getToolResultTokenBudget } from "./token-budget";

const MAX_TOOL_ITERATIONS = 4;

/** Floor for a single result once the loop budget is nearly spent — see the call site. */
const MIN_TOOL_RESULT_TOKEN_BUDGET = 300;

function toProviderToolSpecs(): AIProviderToolSpec[] {
  bootstrapTools();
  return listTools().map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
}

/**
 * Explicitly delimits a tool's raw result as untrusted reference data
 * before it re-enters the conversation — some tool results carry real
 * third-party content (an article's body, a podcast transcript) this
 * service has no control over, and nothing previously marked that
 * content as "data to reference," never "instructions to follow"
 * (docs/final-production-readiness-review.md's prompt-injection P0).
 * Paired with UNTRUSTED_CONTENT_POLICY in the system prompt
 * (src/ai/prompts/tuto/sections.ts), which tells the model explicitly
 * what these tags mean.
 *
 * `serialized` is already budget-fitted by the caller (see
 * ./token-budget.ts) — this function only wraps, so the untrusted-data
 * delimiting and the cost ceiling stay separate concerns.
 */
function wrapUntrustedToolResult(serialized: string): string {
  return `<untrusted_tool_data>\n${serialized}\n</untrusted_tool_data>`;
}

export interface ToolLoopResult {
  completion: AIProviderCompletionResult;
  /** Every tool call executed across every iteration, in order — empty if the model never called one. */
  toolResults: ToolExecutionResult[];
}

export interface RunToolLoopOptions {
  /** Constrains the eventual final answer to JSON matching a schema (Sprint 4) — a tool-call turn is unaffected. */
  responseFormat?: AIProviderResponseFormat;
  /** The bundled repository access (src/ai/data) handed to every tool call via ToolExecutionContext — undefined only for a caller that hasn't wired one up, in which case content-reading tools degrade gracefully. */
  dependencies?: AIDependencies;
  /** Attribution label forwarded to usage telemetry (src/ai/telemetry) so spend can be broken down per feature. */
  feature?: string;
}

/**
 * The Tool Execution Layer (Sprint 3):
 *
 *   AI -> Tool Selection -> Execute Tool -> Return Structured Result -> Continue AI Response
 *
 * Runs entirely on `provider.complete()`, never `stream()` — a tool call
 * has to be fully assembled by the provider before it can be executed, so
 * there's no partial-tool-call state to stream through. See
 * docs/ai-architecture.md's "Streaming + tools" note for the tradeoff
 * this implies for src/ai/services/ai-service.ts's streamResponse().
 *
 * Returns as soon as the provider answers with no further tool calls, or
 * after MAX_TOOL_ITERATIONS as a safety valve against a model stuck
 * calling tools indefinitely — the final iteration drops the `tools`
 * option entirely, forcing a plain answer. `options.responseFormat`, when
 * given, is passed on every call including that final one, so a
 * structured-output request (src/ai/services/ai-service.ts's
 * generateStructuredResponse()) still gets valid JSON even if the safety
 * valve fires.
 */
export async function runToolLoop(
  provider: AIProvider,
  initialMessages: AIProviderMessage[],
  learningContext: LearningContext,
  options: RunToolLoopOptions = {},
): Promise<ToolLoopResult> {
  const { responseFormat, dependencies, feature } = options;
  const tools = toProviderToolSpecs();

  if (tools.length === 0) {
    return { completion: await provider.complete({ messages: initialMessages, responseFormat, feature }), toolResults: [] };
  }

  const context: ToolExecutionContext = { learningContext, dependencies };
  const toolResults: ToolExecutionResult[] = [];
  let messages = initialMessages;

  // Cumulative ceiling across the whole loop. A per-result budget alone
  // still lets several individually-acceptable results compound, and
  // every one of them is re-sent on each later iteration — so the loop
  // total is the number that actually maps to spend.
  const perResultBudget = getToolResultTokenBudget();
  let remainingLoopBudget = getToolLoopTokenBudget();

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await provider.complete({ messages, tools, responseFormat, feature });

    if (!result.toolCalls || result.toolCalls.length === 0) {
      return { completion: result, toolResults };
    }

    const assistantTurn: AIProviderMessage = { role: "assistant", content: result.content, toolCalls: result.toolCalls };
    const toolMessages: AIProviderMessage[] = [];

    for (const call of result.toolCalls) {
      const executed = await executeToolCall(call, context);
      toolResults.push(executed);

      // Never below a small floor: a result squeezed to nothing would be
      // worse than a clearly-truncated one, since the model would have
      // no idea what it asked for even returned anything.
      const budget = Math.max(Math.min(perResultBudget, remainingLoopBudget), MIN_TOOL_RESULT_TOKEN_BUDGET);
      const fitted = fitToolResultToBudget(executed.result, budget);
      remainingLoopBudget = Math.max(remainingLoopBudget - fitted.estimatedTokens, 0);

      toolMessages.push({ role: "tool", content: wrapUntrustedToolResult(fitted.content), toolCallId: executed.toolCallId });
    }

    messages = [...messages, assistantTurn, ...toolMessages];
  }

  const finalCompletion = await provider.complete({ messages, responseFormat, feature });
  return { completion: finalCompletion, toolResults };
}
