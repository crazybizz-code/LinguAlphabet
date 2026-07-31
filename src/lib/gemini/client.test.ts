import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseRetryAfter, computeBackoffDelay, generateJson, GeminiRateLimitError, GeminiTransientError } from "./client";

const SCHEMA = { type: "OBJECT", properties: {} };

function okResponse(text = '{"ok":true}') {
  return { ok: true, status: 200, statusText: "OK", headers: new Headers(), json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
}
function errResponse(status: number, headers: Record<string, string> = {}) {
  return { ok: false, status, statusText: "Err", headers: new Headers(headers), json: async () => ({}) };
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Runs a promise while auto-advancing fake timers, so backoff sleeps resolve instantly. */
async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const result = await settled;
  if (result.ok) return result.value;
  throw result.error;
}

describe("parseRetryAfter", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfter("30")).toBe(30_000);
  });

  it("parses an HTTP-date into a positive delta", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:45 GMT", now)).toBe(45_000);
  });

  it("clamps a past HTTP-date to 0 rather than returning a negative sleep", () => {
    const now = Date.parse("2026-01-01T00:01:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:00 GMT", now)).toBe(0);
  });

  it("returns null for absent or unparseable values so the caller falls back to computed backoff", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
    expect(parseRetryAfter("   ")).toBeNull();
    expect(parseRetryAfter("soon-ish")).toBeNull();
  });
});

describe("computeBackoffDelay", () => {
  it("grows exponentially with the attempt number", () => {
    const alwaysMax = () => 0.999999;
    const a0 = computeBackoffDelay(0, 2000, 20_000, alwaysMax);
    const a1 = computeBackoffDelay(1, 2000, 20_000, alwaysMax);
    const a2 = computeBackoffDelay(2, 2000, 20_000, alwaysMax);
    expect(a1).toBeGreaterThan(a0);
    expect(a2).toBeGreaterThan(a1);
  });

  it("applies FULL jitter — the delay spans [0, exponential), not a narrow band around it", () => {
    expect(computeBackoffDelay(3, 2000, 20_000, () => 0)).toBe(0);
    expect(computeBackoffDelay(3, 2000, 20_000, () => 0.999999)).toBeGreaterThan(15_000);
  });

  it("never exceeds the cap", () => {
    expect(computeBackoffDelay(20, 2000, 20_000, () => 0.999999)).toBeLessThanOrEqual(20_000);
  });
});

describe("generateJson rate limiting", () => {
  it("retries a 429 and succeeds once the window reopens", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errResponse(429)).mockResolvedValueOnce(errResponse(429)).mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(runWithTimers(generateJson("p", SCHEMA))).resolves.toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a 429 more times than the old shared policy allowed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(429));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runWithTimers(generateJson("p", SCHEMA))).rejects.toThrow(GeminiRateLimitError);
    // Old policy was 3 retries (4 calls). Anything at or below that would
    // reproduce the production outage.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(4);
  });

  it("throws GeminiRateLimitError — never a permanent failure — when the quota never reopens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errResponse(429)));
    const error = await runWithTimers(generateJson("p", SCHEMA)).catch((e) => e);

    expect(error).toBeInstanceOf(GeminiRateLimitError);
    // Still a transient error, so any existing `instanceof GeminiTransientError` check keeps working.
    expect(error).toBeInstanceOf(GeminiTransientError);
    expect(String(error.message)).toMatch(/rate limited/i);
  });

  it("honours Retry-After when the API sends one", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errResponse(429, { "retry-after": "3" })).mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const sleepSpy = vi.spyOn(globalThis, "setTimeout");

    await runWithTimers(generateJson("p", SCHEMA));

    const waits = sleepSpy.mock.calls.map((call) => call[1]);
    expect(waits).toContain(3000);
  });

  it("caps an absurd Retry-After so one response cannot stall the whole run", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errResponse(429, { "retry-after": "3600" })).mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const sleepSpy = vi.spyOn(globalThis, "setTimeout");

    await runWithTimers(generateJson("p", SCHEMA));

    const waits = sleepSpy.mock.calls.map((call) => Number(call[1])).filter((ms) => ms > 0);
    expect(Math.max(...waits)).toBeLessThanOrEqual(20_000);
  });

  it("abandons the call once the total wait budget is spent, rather than consuming the run's time", async () => {
    // Every response demands the maximum wait; the budget must stop it.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errResponse(429, { "retry-after": "20" })));
    const sleepSpy = vi.spyOn(globalThis, "setTimeout");

    await expect(runWithTimers(generateJson("p", SCHEMA))).rejects.toThrow(GeminiRateLimitError);

    const totalWait = sleepSpy.mock.calls.map((call) => Number(call[1])).filter((ms) => ms > 0).reduce((a, b) => a + b, 0);
    expect(totalWait).toBeLessThanOrEqual(45_000);
  });
});

describe("generateJson non-rate-limit behaviour", () => {
  it("retries a 5xx and throws GeminiTransientError — but NOT GeminiRateLimitError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errResponse(503)));
    const error = await runWithTimers(generateJson("p", SCHEMA)).catch((e) => e);

    expect(error).toBeInstanceOf(GeminiTransientError);
    expect(error).not.toBeInstanceOf(GeminiRateLimitError);
  });

  it("recovers from a transient 5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errResponse(500)).mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await expect(runWithTimers(generateJson("p", SCHEMA))).resolves.toBe('{"ok":true}');
  });

  it("fails fast on a non-retryable 4xx without consuming retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runWithTimers(generateJson("p", SCHEMA))).rejects.toThrow(/Gemini API error: 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws immediately when the API key is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generateJson("p", SCHEMA)).rejects.toThrow(/GEMINI_API_KEY is not configured/);
  });

  it("succeeds on the first try with no delay when nothing is wrong", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(runWithTimers(generateJson("p", SCHEMA))).resolves.toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
