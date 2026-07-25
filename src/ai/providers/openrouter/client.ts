import type {
  AIProvider,
  AIProviderCompletionInput,
  AIProviderCompletionResult,
  AIProviderMessage,
  AIProviderResponseFormat,
  AIProviderStreamChunk,
  AIProviderToolCall,
  AIProviderToolSpec,
} from "../types";
import { AIProviderError } from "../errors";
import { loadEnvConfig } from "@next/env";

// TEMPORARY DIAGNOSTICS — inspects @next/env's actual parse of .env.local
// directly (not just process.env after the fact), to find exactly why
// OPENROUTER_API_KEY/OPENROUTER_MODEL don't survive parsing even though
// NEXT_PUBLIC_SUPABASE_URL (same file, same loader) does. Never logs a
// secret value — only structural facts about each line (length, quote
// characters, comment position).
const SENSITIVE_KEY_PATTERN = /KEY|SECRET|TOKEN|PASSWORD/i;

function maskAssignmentLine(line: string): string {
  // Strip a leading comment marker first so a commented-out sensitive
  // line (e.g. "# OPENROUTER_API_KEY=...") still gets its value redacted
  // instead of printed in full — a real, demonstrated bug in an earlier
  // version of this diagnostic.
  const commentMatch = line.match(/^(\s*)(#\s*)(.*)$/);
  const prefix = commentMatch ? commentMatch[1] + commentMatch[2] : "";
  const body = commentMatch ? commentMatch[3] : line;

  const match = body.match(/^(?:export\s+)?([\w.-]+)(\s*[=:]\s*)(.*)$/);
  if (!match) return line;
  const [, key, sep, rest] = match;
  if (!SENSITIVE_KEY_PATTERN.test(key)) return line;
  const hashIndex = rest.indexOf("#");
  return (
    `${prefix}${key}${sep}<redacted len=${rest.length} ` +
    `startsWithQuote=${/^['"`]/.test(rest)} endsWithQuote=${/['"`]\s*$/.test(rest)} ` +
    `hashAt=${hashIndex}>`
  );
}

function logEnvParseDiagnostics() {
  const { parsedEnv, loadedEnvFiles } = loadEnvConfig(process.cwd(), true, undefined, true);

  console.log(
    "[tuto-debug] loadedEnvFiles:",
    loadedEnvFiles.map((f) => ({
      path: f.path,
      byteLength: f.contents.length,
      hasCRLF: f.contents.includes("\r\n"),
      hasLoneCR: /\r(?!\n)/.test(f.contents),
      doubleQuoteCount: (f.contents.match(/"/g) ?? []).length,
      singleQuoteCount: (f.contents.match(/'/g) ?? []).length,
    })),
  );

  for (const file of loadedEnvFiles) {
    if (!file.path.includes(".env.local")) continue;

    const rawLines = file.contents.split(/\r\n|\r|\n/);
    console.log(`[tuto-debug] ${file.path}: ${rawLines.length} raw lines, masked view:`);
    rawLines.forEach((line, i) => {
      console.log(`  [${file.path}:${i + 1}] ${JSON.stringify(maskAssignmentLine(line))}`);
    });

    console.log(`[tuto-debug] ${file.path} parsed keys (what dotenv actually produced):`, Object.keys(file.env));
  }

  // NOTE: @next/env caches its first-ever process.env snapshot for the
  // life of the process and only reports "newly discovered" keys in
  // `parsedEnv` against that stale baseline on repeat calls — since Next
  // itself already called loadEnvConfig once before this diagnostic runs,
  // `parsedEnv` reads empty here EVEN WHEN PARSING IS CORRECT. It is not
  // a reliable signal; logged only for completeness, do not read into it.
  console.log(
    "[tuto-debug] (unreliable, see note above) parsedEnv keys containing OPEN:",
    Object.fromEntries(
      Object.entries(parsedEnv ?? {})
        .filter(([k]) => /OPEN/i.test(k))
        .map(([k, v]) => [k, v ? `<redacted len=${v.length}>` : v]),
    ),
  );

  // The real ground truth for whether getConfig() below will succeed.
  console.log("[tuto-debug] ACTUAL process.env.OPENROUTER_API_KEY !== undefined:", process.env.OPENROUTER_API_KEY !== undefined);
  console.log("[tuto-debug] ACTUAL process.env.OPENROUTER_MODEL !== undefined:", process.env.OPENROUTER_MODEL !== undefined);
}
// END TEMPORARY DIAGNOSTICS

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
  logEnvParseDiagnostics(); // TEMPORARY — see definition above

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

/** OpenAI-compatible structured outputs — constrains `content` to valid JSON matching `schema`; never applies to a tool-call turn. */
function toWireResponseFormat(responseFormat?: AIProviderResponseFormat) {
  if (!responseFormat) return undefined;
  return {
    type: "json_schema" as const,
    json_schema: { name: responseFormat.name, strict: true, schema: responseFormat.schema },
  };
}

/**
 * Server-only: OPENROUTER_API_KEY must never reach a Client Component,
 * same convention as GEMINI_API_KEY (docs/coding-standards.md). Model is
 * never hardcoded — OPENROUTER_MODEL is read fresh on every call so
 * changing it is a config change, not a deploy.
 *
 * `responseFormat` (Sprint 4) only ever constrains `content` — a turn
 * where the model calls a tool instead still returns `toolCalls` exactly
 * as it would without one.
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
      response_format: toWireResponseFormat(input.responseFormat),
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
