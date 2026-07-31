const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** 5xx: the API is momentarily unwell. Short backoff, few attempts — these clear in milliseconds or not at all. */
const SERVER_ERROR_STATUS_CODES = new Set([500, 502, 503, 504]);
const SERVER_ERROR_MAX_RETRIES = 3;
const SERVER_ERROR_BASE_DELAY_MS = 500;

/**
 * 429 is a different failure with a different shape and needs its own
 * schedule. Gemini's free-tier quotas are windowed (per-minute and
 * per-day), so the old shared policy — 3 retries at 500ms/1s/2s, ~3.5s
 * total — could never outlast even a per-minute window. That is exactly
 * why a real production ingest run marked every item RETRY_PENDING with
 * "429 after 3 retries": the retries were real, they were just far too
 * short to matter.
 */
const RATE_LIMIT_MAX_RETRIES = 5;
const RATE_LIMIT_BASE_DELAY_MS = 2000;
/** Ceiling on any single wait, so one absurd Retry-After can't stall a run. */
const RATE_LIMIT_MAX_DELAY_MS = 20_000;
/**
 * Total time one call may spend waiting on 429 before giving up. The
 * ingest route's maxDuration is 300s and a run processes ~18 items, so an
 * item that camps on a quota window forever would starve every source
 * after it. Giving up here is safe: the pipeline leaves processed_at
 * null, so the item is retried on the next run rather than lost.
 */
const RATE_LIMIT_TOTAL_BUDGET_MS = 45_000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses a Retry-After header into milliseconds. HTTP allows either
 * delta-seconds or an HTTP-date, and Gemini has been observed using the
 * former; both are handled rather than assuming one.
 *
 * Returns null for absent/unparseable/negative values so the caller
 * falls back to computed backoff — a malformed header must never be able
 * to produce a NaN sleep or a negative one.
 *
 * Exported for tests.
 */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // delta-seconds
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed) * 1000;
    return Number.isFinite(ms) ? ms : null;
  }

  // HTTP-date
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  const delta = parsed - now;
  return delta > 0 ? delta : 0;
}

/**
 * Full-jitter exponential backoff (AWS's "Exponential Backoff and
 * Jitter"): a random wait in [0, exponential), not exponential ± a
 * wobble. Without jitter, every item in a run that hits the same quota
 * wall retries on the same schedule and collides again on every attempt —
 * with 15 sources ingesting in one invocation that is a self-inflicted
 * thundering herd, and it is a large part of why the previous policy
 * failed.
 *
 * `random` is injectable so tests can assert bounds deterministically.
 * Exported for tests.
 */
export function computeBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  return Math.floor(random() * exponential);
}

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

  let rateLimitAttempts = 0;
  let serverErrorAttempts = 0;
  let rateLimitWaitedMs = 0;
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

      if (rateLimitAttempts >= RATE_LIMIT_MAX_RETRIES) {
        throw new GeminiRateLimitError(
          `Gemini API rate limited: ${lastRateLimitStatus} after ${rateLimitAttempts} retries (waited ${Math.round(rateLimitWaitedMs / 1000)}s total)`,
        );
      }

      // An explicit Retry-After is the API telling us exactly when the
      // window reopens — always better than a guess, but still capped so
      // a large value can't stall the run.
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      const delay =
        retryAfterMs !== null
          ? Math.min(retryAfterMs, RATE_LIMIT_MAX_DELAY_MS)
          : computeBackoffDelay(rateLimitAttempts, RATE_LIMIT_BASE_DELAY_MS, RATE_LIMIT_MAX_DELAY_MS);

      if (rateLimitWaitedMs + delay > RATE_LIMIT_TOTAL_BUDGET_MS) {
        throw new GeminiRateLimitError(
          `Gemini API rate limited: ${lastRateLimitStatus}; giving up after ${Math.round(rateLimitWaitedMs / 1000)}s of waiting to protect the run's time budget (item will be retried on the next run)`,
        );
      }

      rateLimitAttempts += 1;
      rateLimitWaitedMs += delay;
      await sleep(delay);
      continue;
    }

    if (SERVER_ERROR_STATUS_CODES.has(response.status)) {
      if (serverErrorAttempts >= SERVER_ERROR_MAX_RETRIES) {
        throw new GeminiTransientError(
          `Gemini API error after ${serverErrorAttempts} retries: ${response.status} ${response.statusText}`,
        );
      }
      const delay = computeBackoffDelay(serverErrorAttempts, SERVER_ERROR_BASE_DELAY_MS, 8000);
      serverErrorAttempts += 1;
      await sleep(delay);
      continue;
    }

    // Non-retryable: bad request, auth failure, anything else.
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }
}
