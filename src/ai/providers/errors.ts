/**
 * Thrown by any AI provider on failure. `status` mirrors the upstream
 * HTTP status where one exists, so the API route (src/app/api/ai/chat)
 * can propagate a sensible status instead of always answering 500.
 * `retryable` flags transient failures (rate limits, upstream 5xx) as
 * distinct from permanent ones (bad request, missing config) — mirrors
 * GeminiTransientError's role in src/lib/gemini/client.ts.
 */
export class AIProviderError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  /**
   * Parsed `Retry-After`, in milliseconds, when the upstream sent one.
   *
   * Additive and inert: nothing reads it unless a caller opts into a
   * retry policy (src/ai/retry). It exists because honouring an explicit
   * Retry-After was a tested behaviour of the direct Gemini client, and
   * moving batch work onto this gateway would otherwise have quietly
   * downgraded it to guessed backoff.
   */
  readonly retryAfterMs?: number | null;

  constructor(message: string, status?: number, retryable = false, retryAfterMs?: number | null) {
    super(message);
    this.name = "AIProviderError";
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}
