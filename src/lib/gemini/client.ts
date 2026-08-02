import { BATCH_RETRY_POLICY, createRetryController, parseRetryAfter, sleep } from "@/ai/retry";

/**
 * SCHEDULED FOR REMOVAL. Content Engine enrichment has moved to the
 * OpenRouter gateway (src/ai/services/generate-structured-json.ts); the
 * only remaining caller is src/lib/vocabulary/lookup.ts, which is
 * migrating separately. Nothing new should import this.
 *
 * The retry schedules that used to live here now live in src/ai/retry —
 * unchanged, and shared with the gateway so that moving off this client
 * could not silently discard them. This file drives the same state
 * machine and its behaviour is identical, which its own test suite
 * (client.test.ts, untouched) still verifies.
 */
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** 5xx: the API is momentarily unwell. Short backoff, few attempts — these clear in milliseconds or not at all. */
const SERVER_ERROR_STATUS_CODES = new Set([500, 502, 503, 504]);

/** Re-exported so this client's public surface — and its tests — are unchanged by the move. */
export { parseRetryAfter, computeBackoffDelay } from "@/ai/retry";

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/**
 * Thrown when every retry attempt still failed with a transient status —
 * distinguished from a plain Error so callers (the Content Engine
 * pipeline) can tell "worth trying again on the next run" apart from a
 * non-retryable failure (bad request, missing key, malformed response
 * shape), which fails fast.
 */
export class GeminiTransientError extends Error {}

/**
 * Specifically a quota / rate-limit refusal (HTTP 429), not a general
 * transient error. Separated so the pipeline can label these — and only
 * these — RETRY_PENDING: "the model is fine, we asked too fast" is an
 * operationally different signal from "the API is erroring", and
 * conflating them made the status field useless for diagnosing exactly
 * the outage this fixes.
 */
export class GeminiRateLimitError extends GeminiTransientError {}

/**
 * Thin fetch wrapper — no SDK dependency for a single endpoint. Server-only:
 * GEMINI_API_KEY must never reach a Client Component (docs/coding-standards.md).
 * responseSchema forces structured JSON back from the model instead of
 * fragile markdown-fence/regex parsing of free text.
 *
 * RETRY POLICY — two separate schedules, because 429 and 5xx are
 * different problems:
 *
 *   429 (quota/rate limit): up to 5 attempts, full-jitter exponential
 *     backoff from 2s, each wait capped at 20s, honouring Retry-After
 *     when the API sends one, and abandoning the call once 45s of
 *     cumulative waiting is spent so a single item cannot consume the
 *     whole run's time budget. Always throws GeminiRateLimitError, never
 *     a permanent failure.
 *
 *   5xx: up to 3 attempts, jittered backoff from 500ms. Throws
 *     GeminiTransientError.
 *
 * Anything else (missing key, 4xx other than 429, malformed response)
 * throws immediately without consuming a retry.
 */
export async function generateJson(prompt: string, responseSchema: object): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const retry = createRetryController(BATCH_RETRY_POLICY);
  let lastRateLimitStatus = "";

  for (;;) {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });

    if (response.ok) {
      const data: GeminiGenerateContentResponse = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Gemini API returned no content");
      }
      return text;
    }

    if (response.status === 429) {
      lastRateLimitStatus = `${response.status} ${response.statusText}`;

      const decision = retry.onRateLimit(parseRetryAfter(response.headers.get("retry-after")));
      if (decision.action === "give-up") {
        throw new GeminiRateLimitError(
          decision.reason === "attempts"
            ? `Gemini API rate limited: ${lastRateLimitStatus} after ${retry.rateLimitAttempts} retries (waited ${Math.round(retry.rateLimitWaitedMs / 1000)}s total)`
            : `Gemini API rate limited: ${lastRateLimitStatus}; giving up after ${Math.round(retry.rateLimitWaitedMs / 1000)}s of waiting to protect the run's time budget (item will be retried on the next run)`,
        );
      }

      await sleep(decision.delayMs);
      continue;
    }

    if (SERVER_ERROR_STATUS_CODES.has(response.status)) {
      const decision = retry.onServerError();
      if (decision.action === "give-up") {
        throw new GeminiTransientError(
          `Gemini API error after ${retry.serverErrorAttempts} retries: ${response.status} ${response.statusText}`,
        );
      }
      await sleep(decision.delayMs);
      continue;
    }

    // Non-retryable: bad request, auth failure, anything else.
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }
}
