import type { AIProvider, AIProviderCompletionInput, AIProviderCompletionResult, AIProviderStreamChunk } from "../types";
import { AIProviderError } from "../errors";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterChoice {
  message?: { content?: string };
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
      messages: input.messages,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new AIProviderError(`OpenRouter error ${response.status}: ${body}`, response.status, isRetryableStatus(response.status));
  }

  const data: OpenRouterResponse = await response.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    throw new AIProviderError("OpenRouter returned no content", 502, true);
  }

  return {
    content,
    finishReason: choice?.finish_reason ?? null,
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
 */
async function* stream(input: AIProviderCompletionInput): AsyncGenerator<AIProviderStreamChunk> {
  const { apiKey, model } = getConfig();

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: input.messages,
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
