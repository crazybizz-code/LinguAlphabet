/**
 * The contract every AI provider implements. The AI Service (src/ai/services)
 * only ever talks to this interface — swapping OpenRouter for a different
 * provider later means writing one new file here, never touching the
 * service, the API route, or the prompt/context layers.
 */
export interface AIProviderToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments, in the provider's function-calling format. */
  parameters: unknown;
}

export interface AIProviderToolCall {
  id: string;
  name: string;
  /** Raw JSON string exactly as the provider sent it — the caller parses it. */
  arguments: string;
}

export interface AIProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Present on an assistant message that requested one or more tool calls. */
  toolCalls?: AIProviderToolCall[];
  /** Present on a "tool" role message — links the result back to its call. */
  toolCallId?: string;
}

export interface AIProviderCompletionInput {
  messages: AIProviderMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Tools the provider may call this turn. Omitted or empty means "no tools available". */
  tools?: AIProviderToolSpec[];
}

export interface AIProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIProviderCompletionResult {
  content: string;
  finishReason: string | null;
  usage?: AIProviderUsage;
  /** Present when the provider chose to call one or more tools instead of (or alongside) answering directly. */
  toolCalls?: AIProviderToolCall[];
}

export interface AIProviderStreamChunk {
  /** Incremental text to append. Empty on the final `done` chunk. */
  delta: string;
  done: boolean;
}

export interface AIProvider {
  /** Stable id used for registration/lookup (src/ai/providers/registry.ts) — e.g. "openrouter". */
  readonly id: string;
  complete(input: AIProviderCompletionInput): Promise<AIProviderCompletionResult>;
  /** Text-only streaming — does not itself support tool-calling (src/ai/services/tool-loop.ts explains why). */
  stream(input: AIProviderCompletionInput): AsyncGenerator<AIProviderStreamChunk>;
}
