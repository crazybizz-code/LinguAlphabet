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

  constructor(message: string, status?: number, retryable = false) {
    super(message);
    this.name = "AIProviderError";
    this.status = status;
    this.retryable = retryable;
  }
}
