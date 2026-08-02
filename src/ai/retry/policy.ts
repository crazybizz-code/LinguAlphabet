/**
 * Retry policy for AI calls — provider-neutral, extracted unchanged from
 * src/lib/gemini/client.ts.
 *
 * WHY IT MOVED. The schedules below were tuned against a real production
 * outage: a 15-source ingest run marked every item RETRY_PENDING with
 * "429 after 3 retries" because the old shared policy (3 retries at
 * 500ms/1s/2s, ~3.5s total) could not outlast even a per-minute quota
 * window. That lesson lived inside one provider's client. Moving
 * enrichment onto the OpenRouter gateway would have silently discarded
 * it, because the OpenRouter provider classifies errors as retryable and
 * then never retries.
 *
 * So the schedules are here, the numbers are untouched, and both clients
 * drive the same state machine rather than each having their own.
 *
 * DELIBERATELY NOT A DEFAULT. Nothing retries because this module exists;
 * a caller passes a policy or gets none. Interactive paths — Tuto chat,
 * word lookup — must not inherit a batch job's patience, because a user
 * waiting 45 seconds for a reply is a worse outcome than an error.
 */

/** 5xx: the API is momentarily unwell. Short backoff, few attempts — these clear in milliseconds or not at all. */
export interface ServerErrorPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface RateLimitPolicy {
  maxRetries: number;
  baseDelayMs: number;
  /** Ceiling on any single wait, so one absurd Retry-After can't stall a run. */
  maxDelayMs: number;
  /**
   * Total time one call may spend waiting on 429 before giving up. The
   * ingest route's maxDuration is 300s and a run processes ~18 items, so
   * an item that camps on a quota window forever would starve every
   * source after it. Giving up is safe: the pipeline leaves processed_at
   * null, so the item is retried on the next run rather than lost.
   */
  totalBudgetMs: number;
}

export interface RetryPolicy {
  rateLimit: RateLimitPolicy;
  serverError: ServerErrorPolicy;
}

/**
 * The batch-ingestion schedule, carried over from the Gemini client with
 * every number identical.
 *
 * 429 and 5xx get separate schedules because they are different problems.
 * Gemini's quotas are windowed (per-minute and per-day), so a rate limit
 * needs a schedule long enough to outlast a window; a 5xx does not.
 */
export const BATCH_RETRY_POLICY: RetryPolicy = {
  rateLimit: {
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 20_000,
    totalBudgetMs: 45_000,
  },
  serverError: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 8000,
  },
};

/** For interactive callers: fail immediately and let the UI say so. */
export const NO_RETRY_POLICY: RetryPolicy = {
  rateLimit: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0, totalBudgetMs: 0 },
  serverError: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0 },
};

export function sleep(ms: number): Promise<void> {
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

export type RetryDecision =
  | { action: "retry"; delayMs: number }
  | { action: "give-up"; reason: "attempts" | "budget" };

export interface RetryController {
  /** `retryAfterMs` is the parsed Retry-After when the provider sent one, null to use computed backoff. */
  onRateLimit(retryAfterMs: number | null): RetryDecision;
  onServerError(): RetryDecision;
  /** Counters, for the give-up message a caller writes in its own vocabulary. */
  readonly rateLimitAttempts: number;
  readonly rateLimitWaitedMs: number;
  readonly serverErrorAttempts: number;
}

/**
 * One call's retry state. Created per call, never shared — the budget is
 * per call, exactly as it was when this lived inside the Gemini client's
 * `for(;;)` loop.
 *
 * The order of checks is load-bearing and preserved as-is: the attempt
 * limit is tested BEFORE a delay is computed, the budget AFTER, so a
 * final attempt is never billed for a wait it did not take.
 */
export function createRetryController(
  policy: RetryPolicy,
  random: () => number = Math.random,
): RetryController {
  let rateLimitAttempts = 0;
  let rateLimitWaitedMs = 0;
  let serverErrorAttempts = 0;

  return {
    get rateLimitAttempts() {
      return rateLimitAttempts;
    },
    get rateLimitWaitedMs() {
      return rateLimitWaitedMs;
    },
    get serverErrorAttempts() {
      return serverErrorAttempts;
    },

    onRateLimit(retryAfterMs: number | null): RetryDecision {
      if (rateLimitAttempts >= policy.rateLimit.maxRetries) {
        return { action: "give-up", reason: "attempts" };
      }

      // An explicit Retry-After is the API telling us exactly when the
      // window reopens — always better than a guess, but still capped so
      // a large value can't stall the run.
      const delayMs =
        retryAfterMs !== null
          ? Math.min(retryAfterMs, policy.rateLimit.maxDelayMs)
          : computeBackoffDelay(rateLimitAttempts, policy.rateLimit.baseDelayMs, policy.rateLimit.maxDelayMs, random);

      if (rateLimitWaitedMs + delayMs > policy.rateLimit.totalBudgetMs) {
        return { action: "give-up", reason: "budget" };
      }

      rateLimitAttempts += 1;
      rateLimitWaitedMs += delayMs;
      return { action: "retry", delayMs };
    },

    onServerError(): RetryDecision {
      if (serverErrorAttempts >= policy.serverError.maxRetries) {
        return { action: "give-up", reason: "attempts" };
      }
      const delayMs = computeBackoffDelay(
        serverErrorAttempts,
        policy.serverError.baseDelayMs,
        policy.serverError.maxDelayMs,
        random,
      );
      serverErrorAttempts += 1;
      return { action: "retry", delayMs };
    },
  };
}
