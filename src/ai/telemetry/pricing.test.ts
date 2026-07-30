import { describe, it, expect, afterEach } from "vitest";
import { estimateCostUsd, getModelPricing } from "./pricing";

const ORIGINAL = process.env.AI_MODEL_PRICING;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AI_MODEL_PRICING;
  else process.env.AI_MODEL_PRICING = ORIGINAL;
});

describe("estimateCostUsd", () => {
  it("prices a known model from its input and output tokens", () => {
    // 1M input @ $0.30 + 1M output @ $2.50
    expect(estimateCostUsd("google/gemini-2.5-flash", 1_000_000, 1_000_000)).toBe(2.8);
  });

  it("keeps sub-cent precision — rounding a cheap request to 0 would erase the per-request detail this exists for", () => {
    const cost = estimateCostUsd("google/gemini-2.5-flash", 5_000, 500);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });

  it("returns null for an unknown model rather than 0 — a silent zero would make it look free", () => {
    expect(estimateCostUsd("some/unlisted-model", 1000, 1000)).toBeNull();
  });

  it("returns null when token counts are absent, instead of fabricating a cost", () => {
    expect(estimateCostUsd("google/gemini-2.5-flash", null, 100)).toBeNull();
    expect(estimateCostUsd("google/gemini-2.5-flash", 100, null)).toBeNull();
  });

  it("still prices the outgoing model so historical rows remain comparable across the switch", () => {
    expect(estimateCostUsd("openai/gpt-5.5", 1_000_000, 0)).toBe(1.25);
  });

  it("confirms the switch is a real saving at identical token volumes", () => {
    const before = estimateCostUsd("openai/gpt-5.5", 100_000, 10_000)!;
    const after = estimateCostUsd("google/gemini-2.5-flash", 100_000, 10_000)!;
    expect(after).toBeLessThan(before);
  });
});

describe("AI_MODEL_PRICING overrides", () => {
  it("lets a price change be a config edit rather than a deploy", () => {
    process.env.AI_MODEL_PRICING = "google/gemini-2.5-flash:1,2";
    expect(getModelPricing("google/gemini-2.5-flash")).toEqual({ inputPerMillion: 1, outputPerMillion: 2 });
  });

  it("supports multiple models", () => {
    process.env.AI_MODEL_PRICING = "a/b:1,2;c/d:3,4";
    expect(getModelPricing("c/d")).toEqual({ inputPerMillion: 3, outputPerMillion: 4 });
  });

  it("skips a malformed entry instead of throwing — pricing metadata must never break an AI request", () => {
    process.env.AI_MODEL_PRICING = "garbage;;a/b:notanumber,2;c/d:3,4";
    expect(getModelPricing("a/b")).toBeNull();
    expect(getModelPricing("c/d")).toEqual({ inputPerMillion: 3, outputPerMillion: 4 });
  });
});
