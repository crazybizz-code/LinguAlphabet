import type {
  AIProvider,
  AIProviderCompletionInput,
  AIProviderCompletionResult,
  AIProviderMessage,
  AIProviderStreamChunk,
  AIProviderToolCall,
  AIProviderToolSpec,
} from "../types";
import { AIProviderError } from "../errors";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterWireToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface OpenRouterWireMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

interface OpenRouterChoice {
  message?: { content?: string | null; tool_calls?: OpenRouterWireToolCall[] };
  delta?: { content?: string };
  finish_reason?: string | null;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

function getConfig(): { apiKey: string; model: string } {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey) throw new AIProviderError("OPENROUTER_API_KEY is not configured", 500, false);
  if (!model) throw new AIProviderError("OPENROUTER_MODEL is not configured", 500, false);
  return { apiKey, model };
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // Optional per OpenRouter's docs — attributes usage to this app on their dashboard, purely informational.
    "X-Title": "LinguABC",
  };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) headers["HTTP-Referer"] = siteUrl;
  return headers;
}

async function readErrorBody(response: Response): Promise<string> {
  return response.text().catch(() => response.statusText);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** OpenAI-compatible wire format: a "tool" message needs `tool_call_id`; an assistant tool-call turn needs `tool_calls`. */
function toWireMessage(message: AIProviderMessage): OpenRouterWireMessage {
  const wire: OpenRouterWireMessage = { role: message.role, content: message.content || null };
  if (message.toolCallId) wire.tool_call_id = message.toolCallId;
  if (message.toolCalls && message.toolCalls.length > 0) {
    wire.tool_calls = message.toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.arguments },
    }));
  }
  return wire;
}

function toWireTools(tools?: AIProviderToolSpec[]) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

function fromWireToolCalls(wireCalls?: OpenRouterWireToolCall[]): AIProviderToolCall[] | undefined {
  if (!wireCalls || wireCalls.length === 0) return undefined;
  return wireCalls.map((call) => ({ id: call.id, name: call.function.name, arguments: call.function.arguments }));
}

/**
 * Server-only: OPENROUTER_API_KEY must never reach a Client Component,
 * same convention as GEMINI_API_KEY (docs/coding-standards.md). Model is
 * never hardcoded — OPENROUTER_MODEL is read fresh on every call so
 * changing it is a config change, not a deploy.
 */
async function complete(input: AIProviderCompletionInput): Promise<AIProviderCompletionResult> {
  const { apiKey, model } = getConfig();

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: input.messages.map(toWireMessage),
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      tools: toWireTools(input.tools),
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new AIProviderError(`OpenRouter error ${response.status}: ${body}`, response.status, isRetryableStatus(response.status));
  }

  const data: OpenRouterResponse = await response.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";
  const toolCalls = fromWireToolCalls(choice?.message?.tool_calls);

  // A tool-call turn can legitimately have empty content — only a response with neither is broken.
  if (!content && !toolCalls) {
    throw new AIProviderError("OpenRouter returned no content", 502, true);
  }

  return {
    content,
    finishReason: choice?.finish_reason ?? null,
    toolCalls,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

/**
 * OpenRouter streams OpenAI-compatible SSE: `data: {...}\n\n` frames ending
 * in `data: [DONE]`, plus the occasional `: OPENROUTER PROCESSING`
 * keepalive comment line — filtered out by the `data:` prefix check below,
 * same shape their own docs describe.
 *
 * Text-only by design — it does not accept `tools` and never surfaces
 * `toolCalls`. Accumulating a tool call's streamed argument-string deltas
 * correctly is a well-defined but nontrivial feature; the AI Service's
 * tool loop (src/ai/services/tool-loop.ts) uses `complete()` for every
 * tool-selection turn and only reaches for `stream()` once no more tools
 * are being called — see docs/ai-architecture.md's "Streaming + tools"
 * note for the tradeoff this implies.
 */
async function* stream(input: AIProviderCompletionInput): AsyncGenerator<AIProviderStreamChunk> {
  const { apiKey, model } = getConfig();

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: input.messages.map(toWireMessage),
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const body = await readErrorBody(response);
    throw new AIProviderError(`OpenRouter error ${response.status}: ${body}`, response.status, isRetryableStatus(response.status));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          yield { delta: "", done: true };
          return;
        }

        try {
          const parsed: OpenRouterResponse = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content ?? "";
          if (delta) yield { delta, done: false };
        } catch {
          // Malformed/partial frame — skip it rather than crash the stream.
        }
      }
    }
    yield { delta: "", done: true };
  } finally {
    reader.releaseLock();
  }
}

export function createOpenRouterProvider(): AIProvider {
  return { id: "openrouter", complete, stream };
}
