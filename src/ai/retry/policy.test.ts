import { describe, it, expect } from "vitest";
import { BATCH_RETRY_POLICY, NO_RETRY_POLICY, createRetryController } from "./policy";

/**
 * The pure helpers (parseRetryAfter, computeBackoffDelay) keep their
 * original tests in src/lib/gemini/client.test.ts, which imports them
 * through the client's re-export and is unmodified by the extraction —
 * that file passing untouched is the evidence that nothing changed.
 *
 * What is new here is the state machine those helpers now live inside,
 * which was previously inline in a `for(;;)` loop and could only be
 * tested through a mocked fetch.
 */

const alwaysMaxJitter = () => 0.999999;
const noJitter = () => 0;

describe("createRetryController — rate limits", () => {
  it("allows exactly the policy's number of retries, then gives up on attempts", () => {
    const retry = createRetryController(BATCH_RETRY_POLICY, noJitter);

    for (let attempt = 0; attempt < BATCH_RETRY_POLICY.rateLimit.maxRetries; attempt++) {
      expect(retry.onRateLimit(null).action).toBe("retry");
    }
    expect(retry.onRateLimit(null)).toEqual({ action: "give-up", reason: "attempts" });
    expect(retry.rateLimitAttempts).toBe(BATCH_RETRY_POLICY.rateLimit.maxRetries);
  });

  it("honours Retry-After over computed backoff", () => {
    const retry = createRetryController(BATCH_RETRY_POLICY, noJitter);
    expect(retry.onRateLimit(3000)).toEqual({ action: "retry", delayMs: 3000 });
  });

  it("caps an absurd Retry-After so one response cannot stall the run", () => {
    const retry = createRetryController(BATCH_RETRY_POLICY, noJitter);
    const decision = retry.onRateLimit(3_600_000);

    expect(decision).toEqual({ action: "retry", delayMs: BATCH_RETRY_POLICY.rateLimit.maxDelayMs });
  });

  it("gives up on budget before spending more than the total allowance", () => {
    const retry = createRetryController(BATCH_RETRY_POLICY, noJitter);
    // 20s each against a 45s budget: two fit, the third would exceed it.
    expect(retry.onRateLimit(20_000).action).toBe("retry");
    expect(retry.onRateLimit(20_000).action).toBe("retry");
    expect(retry.onRateLimit(20_000)).toEqual({ action: "give-up", reason: "budget" });
    expect(retry.rateLimitWaitedMs).toBeLessThanOrEqual(BATCH_RETRY_POLICY.rateLimit.totalBudgetMs);
  });

  it("does not bill a refused attempt against the budget", () => {
    // Ordering that matters: the attempt limit is checked BEFORE a delay
    // is computed, the budget AFTER — so a give-up never advances the
    // counters and a caller's error message reports what was really spent.
    const retry = createRetryController(BATCH_RETRY_POLICY, noJitter);
    retry.onRateLimit(20_000);
    retry.onRateLimit(20_000);
    const waitedBefore = retry.rateLimitWaitedMs;
    const attemptsBefore = retry.rateLimitAttempts;

    retry.onRateLimit(20_000); // refused on budget

    expect(retry.rateLimitWaitedMs).toBe(waitedBefore);
    expect(retry.rateLimitAttempts).toBe(attemptsBefore);
  });

  it("applies full jitter — a delay anywhere in [0, exponential)", () => {
    expect(createRetryController(BATCH_RETRY_POLICY, noJitter).onRateLimit(null)).toEqual({
      action: "retry",
      delayMs: 0,
    });
    const jittered = createRetryController(BATCH_RETRY_POLICY, alwaysMaxJitter).onRateLimit(null);
    expect(jittered).toMatchObject({ action: "retry" });
    expect((jittered as { delayMs: number }).delayMs).toBeGreaterThan(0);
  });
});

describe("createRetryController — server errors", () => {
  it("allows exactly the policy's number of retries, then gives up", () => {
    const retry = createRetryController(BATCH_RETRY_POLICY, noJitter);

    for (let attempt = 0; attempt < BATCH_RETRY_POLICY.serverError.maxRetries; attempt++) {
      expect(retry.onServerError().action).toBe("retry");
    }
    expect(retry.onServerError()).toEqual({ action: "give-up", reason: "attempts" });
  });

  it("never exceeds its own delay ceiling", () => {
    const retry = createRetryController(BATCH_RETRY_POLICY, alwaysMaxJitter);
    for (let attempt = 0; attempt < BATCH_RETRY_POLICY.serverError.maxRetries; attempt++) {
      const decision = retry.onServerError();
      expect((decision as { delayMs: number }).delayMs).toBeLessThanOrEqual(BATCH_RETRY_POLICY.serverError.maxDelayMs);
    }
  });

  it("counts rate limits and server errors separately", () => {
    // They are different problems on different schedules; exhausting one
    // must not consume the other's budget.
    const retry = createRetryController(BATCH_RETRY_POLICY, noJitter);
    retry.onServerError();
    retry.onServerError();
    retry.onServerError();
    expect(retry.onServerError().action).toBe("give-up");
    expect(retry.onRateLimit(null).action).toBe("retry");
  });
});

describe("NO_RETRY_POLICY", () => {
  it("refuses immediately, so an interactive caller never inherits a batch job's patience", () => {
    const retry = createRetryController(NO_RETRY_POLICY, noJitter);
    expect(retry.onRateLimit(null)).toEqual({ action: "give-up", reason: "attempts" });
    expect(retry.onServerError()).toEqual({ action: "give-up", reason: "attempts" });
  });
});
