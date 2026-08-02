import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { generateStructuredJson } from "./generate-structured-json";
import { AIProviderError, getDefaultProvider, registerProvider } from "@/ai/providers";
import type { AIProvider, AIProviderCompletionResult } from "@/ai/providers";
import { BATCH_RETRY_POLICY } from "@/ai/retry";

const Schema = z.object({ answer: z.string(), score: z.number() });

/** Registered under the id getDefaultProvider() resolves to, so the real lookup path is exercised. */
function install(complete: () => Promise<AIProviderCompletionResult>): { calls: () => number } {
  let calls = 0;
  const provider: AIProvider = {
    id: "openrouter",
    complete: async () => {
      calls += 1;
      return complete();
    },
    stream: async function* () {
      yield { delta: "", done: true };
    },
  };
  registerProvider(provider);
  return { calls: () => calls };
}

function ok(content: string): AIProviderCompletionResult {
  return { content, finishReason: "stop" };
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";
  // Force the real bootstrap to run FIRST. It registers the live
  // OpenRouter provider, so a stub registered before it would be
  // overwritten on the first getDefaultProvider() call and the test
  // would quietly hit the network.
  getDefaultProvider();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

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

describe("generateStructuredJson", () => {
  it("returns typed, schema-validated data", async () => {
    install(async () => ok('{"answer":"yes","score":7}'));

    const result = await runWithTimers(
      generateStructuredJson({ messages: [{ role: "user", content: "hi" }], schema: Schema, schemaName: "test" }),
    );

    expect(result).toEqual({ answer: "yes", score: 7 });
  });

  it("fails closed on output that does not match the schema", async () => {
    // Wrong type, not missing — the shape looks plausible and would slip
    // through anything weaker than real validation.
    install(async () => ok('{"answer":"yes","score":"seven"}'));

    await expect(
      runWithTimers(generateStructuredJson({ messages: [], schema: Schema, schemaName: "test" })),
    ).rejects.toThrow(/did not match the "test" schema/);
  });

  it("fails closed on unparseable JSON", async () => {
    install(async () => ok("Here is your answer: {oops"));

    await expect(
      runWithTimers(generateStructuredJson({ messages: [], schema: Schema, schemaName: "test" })),
    ).rejects.toThrow(/did not return valid JSON/);
  });

  it("does NOT retry a schema mismatch", async () => {
    // A model that answered in the wrong shape has not had a transient
    // failure; retrying burns quota to get the same answer.
    const spy = install(async () => ok('{"answer":"yes"}'));

    await expect(
      runWithTimers(
        generateStructuredJson({
          messages: [],
          schema: Schema,
          schemaName: "test",
          retryPolicy: BATCH_RETRY_POLICY,
        }),
      ),
    ).rejects.toThrow();
    expect(spy.calls()).toBe(1);
  });

  it("does not retry at all by default", async () => {
    const spy = install(async () => {
      throw new AIProviderError("rate limited", 429, true);
    });

    await expect(
      runWithTimers(generateStructuredJson({ messages: [], schema: Schema, schemaName: "test" })),
    ).rejects.toThrow(/rate limited/);
    // An interactive caller must not inherit a batch job's patience.
    expect(spy.calls()).toBe(1);
  });

  it("retries a 429 when given a batch policy, and succeeds when the window reopens", async () => {
    let attempt = 0;
    const spy = install(async () => {
      attempt += 1;
      if (attempt <= 2) throw new AIProviderError("rate limited", 429, true);
      return ok('{"answer":"yes","score":1}');
    });

    const result = await runWithTimers(
      generateStructuredJson({
        messages: [],
        schema: Schema,
        schemaName: "test",
        retryPolicy: BATCH_RETRY_POLICY,
      }),
    );

    expect(result.answer).toBe("yes");
    expect(spy.calls()).toBe(3);
  });

  it("honours Retry-After carried on the provider error", async () => {
    let attempt = 0;
    install(async () => {
      attempt += 1;
      if (attempt === 1) throw new AIProviderError("rate limited", 429, true, 3000);
      return ok('{"answer":"y","score":1}');
    });
    const sleepSpy = vi.spyOn(globalThis, "setTimeout");

    await runWithTimers(
      generateStructuredJson({ messages: [], schema: Schema, schemaName: "test", retryPolicy: BATCH_RETRY_POLICY }),
    );

    expect(sleepSpy.mock.calls.map((call) => call[1])).toContain(3000);
  });

  it("retries a 5xx on its own schedule", async () => {
    let attempt = 0;
    const spy = install(async () => {
      attempt += 1;
      if (attempt === 1) throw new AIProviderError("upstream", 503, true);
      return ok('{"answer":"y","score":1}');
    });

    await runWithTimers(
      generateStructuredJson({ messages: [], schema: Schema, schemaName: "test", retryPolicy: BATCH_RETRY_POLICY }),
    );
    expect(spy.calls()).toBe(2);
  });

  it("fails fast on a non-retryable 4xx without consuming a retry", async () => {
    const spy = install(async () => {
      throw new AIProviderError("bad request", 400, false);
    });

    await expect(
      runWithTimers(
        generateStructuredJson({ messages: [], schema: Schema, schemaName: "test", retryPolicy: BATCH_RETRY_POLICY }),
      ),
    ).rejects.toThrow(/bad request/);
    expect(spy.calls()).toBe(1);
  });

  it("gives up on a 429 that never clears, rather than looping forever", async () => {
    const spy = install(async () => {
      throw new AIProviderError("rate limited", 429, true);
    });

    await expect(
      runWithTimers(
        generateStructuredJson({ messages: [], schema: Schema, schemaName: "test", retryPolicy: BATCH_RETRY_POLICY }),
      ),
    ).rejects.toThrow(/rate limited/);
    // Bounded by the policy, not by the loop guard.
    expect(spy.calls()).toBeLessThanOrEqual(BATCH_RETRY_POLICY.rateLimit.maxRetries + 1);
  });

  it("propagates a non-provider error untouched", async () => {
    install(async () => {
      throw new TypeError("a real bug");
    });

    await expect(
      runWithTimers(
        generateStructuredJson({ messages: [], schema: Schema, schemaName: "test", retryPolicy: BATCH_RETRY_POLICY }),
      ),
    ).rejects.toThrow(TypeError);
  });
});
