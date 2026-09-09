import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setUsageSink, recordUsage, type AIUsageEvent } from "./index";
import { createOpenRouterProvider } from "@/ai/providers/openrouter";

function captureSink() {
  const events: AIUsageEvent[] = [];
  setUsageSink({ record: async (event) => void events.push(event) });
  return events;
}

function okResponse(usage?: Record<string, number>) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
      ...(usage ? { usage } : {}),
    }),
  };
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";
});

afterEach(() => {
  setUsageSink(null);
  vi.unstubAllGlobals();
});

describe("recordUsage", () => {
  it("is a no-op when no sink is configured, so a context without a database records nothing rather than erroring", async () => {
    setUsageSink(null);
    await expect(
      recordUsage({
        model: "m", feature: "f", inputTokens: 1, outputTokens: 1, totalTokens: 2,
        latencyMs: 1, estimatedCostUsd: null, ok: true, streamed: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows a sink failure — telemetry must never fail a learner's request", async () => {
    setUsageSink({ record: async () => { throw new Error("db down"); } });
    await expect(
      recordUsage({
        model: "m", feature: "f", inputTokens: 1, outputTokens: 1, totalTokens: 2,
        latencyMs: 1, estimatedCostUsd: null, ok: true, streamed: false,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("OpenRouter provider telemetry", () => {
  it("records model, tokens, latency, cost and feature for a successful call", async () => {
    const events = captureSink();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ prompt_tokens: 5000, completion_tokens: 500, total_tokens: 5500 })));

    await createOpenRouterProvider().complete({ messages: [{ role: "user", content: "hi" }], feature: "chat" });

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.model).toBe("google/gemini-2.5-flash");
    expect(event.feature).toBe("chat");
    expect(event.inputTokens).toBe(5000);
    expect(event.outputTokens).toBe(500);
    expect(event.totalTokens).toBe(5500);
    expect(event.latencyMs).toBeGreaterThanOrEqual(0);
    expect(event.estimatedCostUsd).toBeGreaterThan(0);
    expect(event.ok).toBe(true);
    expect(event.streamed).toBe(false);
  });

  it("sends a per-call model override and ceiling, and records that resolved model", async () => {
    const events = captureSink();
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }));
    vi.stubGlobal("fetch", fetchMock);

    await createOpenRouterProvider().complete({
      messages: [{ role: "user", content: "hi" }],
      model: "google/gemini-2.5-flash-lite",
      maxTokens: 123,
      feature: "turn_classifier",
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string) as { model: string; max_tokens: number };
    expect(body).toMatchObject({ model: "google/gemini-2.5-flash-lite", max_tokens: 123 });
    expect(events).toHaveLength(1);
    expect(events[0].model).toBe("google/gemini-2.5-flash-lite");
    expect(events[0].estimatedCostUsd).toBeGreaterThan(0);
  });

  it("uses the resolved model and ceiling for streamed requests and telemetry", async () => {
    const events = captureSink();
    const encoder = new TextEncoder();
    const response = {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n'));
          controller.enqueue(encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":5,"total_tokens":25}}\n'));
          controller.enqueue(encoder.encode("data: [DONE]\n"));
          controller.close();
        },
      }),
    };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const chunks = [];
    for await (const chunk of createOpenRouterProvider().stream({
      messages: [{ role: "user", content: "hi" }],
      model: "google/gemini-2.5-flash-lite",
      maxTokens: 200,
      feature: "conversation_summary",
    })) {
      chunks.push(chunk);
    }

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string) as { model: string; max_tokens: number; stream: boolean };
    expect(body).toMatchObject({ model: "google/gemini-2.5-flash-lite", max_tokens: 200, stream: true });
    expect(chunks.some((chunk) => chunk.delta === "hello")).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ model: "google/gemini-2.5-flash-lite", streamed: true });
  });

  it("labels an unattributed call rather than dropping the row", async () => {
    const events = captureSink();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 })));

    await createOpenRouterProvider().complete({ messages: [{ role: "user", content: "hi" }] });
    expect(events[0].feature).toBe("unattributed");
  });

  it("records null tokens — never 0 — when the provider reports no usage", async () => {
    const events = captureSink();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));

    await createOpenRouterProvider().complete({ messages: [{ role: "user", content: "hi" }], feature: "chat" });

    expect(events[0].inputTokens).toBeNull();
    expect(events[0].estimatedCostUsd).toBeNull();
  });

  it("records a failed request, since it still consumed latency and possibly tokens", async () => {
    const events = captureSink();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests", text: async () => "rate limited" }));

    await expect(
      createOpenRouterProvider().complete({ messages: [{ role: "user", content: "hi" }], feature: "chat" }),
    ).rejects.toThrow(/429/);

    expect(events).toHaveLength(1);
    expect(events[0].ok).toBe(false);
  });

  it("does not let a telemetry failure break the actual completion", async () => {
    setUsageSink({ record: async () => { throw new Error("sink exploded"); } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 })));

    const result = await createOpenRouterProvider().complete({ messages: [{ role: "user", content: "hi" }], feature: "chat" });
    expect(result.content).toBe("hello");
  });

  it("records one row per call, so a multi-iteration tool loop is not under-counted", async () => {
    const events = captureSink();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 })));

    const provider = createOpenRouterProvider();
    await provider.complete({ messages: [{ role: "user", content: "1" }], feature: "chat" });
    await provider.complete({ messages: [{ role: "user", content: "2" }], feature: "chat" });

    expect(events).toHaveLength(2);
  });
});
