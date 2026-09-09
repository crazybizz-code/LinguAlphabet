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

/**
 * Statuses that mean "this request cannot succeed however many times it is
 * sent": the account is out of credit (402), the key is wrong (401), or the
 * key is not permitted to do this (403).
 *
 * WHY THIS EXISTS. `retryable` already tells the retry CONTROLLER not to
 * re-send a call, and it correctly refuses to. But the batch pipelines wrap
 * their generation call in their own outer attempt loop, and those loops
 * treated any thrown error as "this draft was bad, make another one". A single
 * 402 therefore regenerated a whole podcast script six times, paying for every
 * script and re-hitting the same unaffordable grading call each round.
 *
 * A budget or credential failure is not a quality problem, so the outer loops
 * ask this and abort instead of paying to rediscover the same answer.
 */
const FATAL_PROVIDER_STATUSES: ReadonlySet<number> = new Set([401, 402, 403]);

export function isFatalProviderError(error: unknown): error is AIProviderError {
  return (
    error instanceof AIProviderError &&
    error.status !== undefined &&
    FATAL_PROVIDER_STATUSES.has(error.status)
  );
}
