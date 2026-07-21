import { getDefaultProvider } from "@/ai/providers";
import type { AIProviderMessage } from "@/ai/providers";
import { buildTutoSystemPrompt } from "@/ai/prompts";
import type { LearningContext } from "@/ai/context";
import type { AssistantMessage, ConversationMessage } from "@/ai/schemas";

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

/**
 * The single entry point for talking to an AI provider (Sprint 1, Phase 6).
 * Nothing outside src/ai — not a Client Component, not another route —
 * should ever import from src/ai/providers directly; everything goes
 * through generateResponse()/streamResponse() so the provider, the system
 * prompt, and the context wiring can all change without touching a caller.
 */
export async function generateResponse(input: GenerateResponseInput): Promise<AssistantMessage> {
  const provider = getDefaultProvider();
  const result = await provider.complete({ messages: toProviderMessages(input) });
  return { role: "assistant", content: result.content };
}

/** Streaming counterpart — yields text deltas as they arrive from the provider. */
export async function* streamResponse(input: GenerateResponseInput): AsyncGenerator<string> {
  const provider = getDefaultProvider();
  for await (const chunk of provider.stream({ messages: toProviderMessages(input) })) {
    if (chunk.delta) yield chunk.delta;
  }
}
