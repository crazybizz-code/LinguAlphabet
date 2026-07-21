/**
 * The contract every AI provider implements. The AI Service (src/ai/services)
 * only ever talks to this interface — swapping OpenRouter for a different
 * provider later means writing one new file here, never touching the
 * service, the API route, or the prompt/context layers.
 */
export interface AIProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIProviderCompletionInput {
  messages: AIProviderMessage[];
  temperature?: number;
  maxTokens?: number;
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
  stream(input: AIProviderCompletionInput): AsyncGenerator<AIProviderStreamChunk>;
}
