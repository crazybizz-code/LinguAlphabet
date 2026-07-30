import { describe, it, expect } from "vitest";
import { estimateTokens, fitToolResultToBudget } from "./token-budget";

function paragraphs(count: number, wordsEach = 60): string[] {
  return Array.from({ length: count }, (_, i) => `Paragraph ${i}. ${"word ".repeat(wordsEach)}`);
}

function segments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    speaker: i % 2 === 0 ? "Host" : "Guest",
    text: `Segment ${i}. ${"spoken words here ".repeat(20)}`,
    timestampSeconds: i * 10,
  }));
}

describe("estimateTokens", () => {
  it("approximates 4 characters per token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

describe("fitToolResultToBudget", () => {
  it("leaves an under-budget result byte-identical — the common case must be untouched", () => {
    const result = { found: true, articleId: "a1", paragraphs: paragraphs(3, 10) };
    const fitted = fitToolResultToBudget(result, 2000);

    expect(fitted.truncated).toBe(false);
    expect(fitted.omittedItems).toBe(0);
    expect(fitted.content).toBe(JSON.stringify(result));
  });

  it("keeps a typical full article intact at the default budget — quality is not degraded to save cost", () => {
    // ~1,200 tokens: a realistic full article body.
    const result = { found: true, articleId: "a1", paragraphs: paragraphs(12, 60) };
    expect(estimateTokens(JSON.stringify(result))).toBeLessThan(2000);
    expect(fitToolResultToBudget(result, 2000).truncated).toBe(false);
  });

  describe("shape-aware truncation", () => {
    it("drops whole paragraphs and reports exactly what was omitted", () => {
      const result = { found: true, articleId: "a1", paragraphs: paragraphs(200, 60) };
      const fitted = fitToolResultToBudget(result, 2000);

      expect(fitted.truncated).toBe(true);
      expect(fitted.omittedItems).toBeGreaterThan(0);

      const parsed = JSON.parse(fitted.content);
      expect(parsed.paragraphs.length + parsed._truncation.omitted).toBe(200);
      expect(parsed._truncation.total).toBe(200);
      // Whole items only — never a half sentence.
      expect(parsed.paragraphs.every((p: string) => p.startsWith("Paragraph "))).toBe(true);
    });

    it("truncates transcript segments the same way, preserving object shape", () => {
      const result = { found: true, podcastId: "p1", segments: segments(900) };
      const fitted = fitToolResultToBudget(result, 2000);

      const parsed = JSON.parse(fitted.content);
      expect(fitted.truncated).toBe(true);
      expect(parsed.segments.length).toBeLessThan(900);
      for (const segment of parsed.segments) {
        expect(segment).toHaveProperty("speaker");
        expect(segment).toHaveProperty("text");
        expect(segment).toHaveProperty("timestampSeconds");
      }
    });

    it("preserves non-array sibling fields so the model keeps the result's identity", () => {
      const result = { found: true, podcastId: "p1", segments: segments(900) };
      const parsed = JSON.parse(fitToolResultToBudget(result, 2000).content);

      expect(parsed.found).toBe(true);
      expect(parsed.podcastId).toBe("p1");
    });

    it("actually respects the budget it was given", () => {
      const result = { found: true, articleId: "a1", paragraphs: paragraphs(500, 60) };
      const fitted = fitToolResultToBudget(result, 1000);

      expect(fitted.estimatedTokens).toBeLessThanOrEqual(1000);
      expect(estimateTokens(fitted.content)).toBeLessThanOrEqual(1000);
    });

    it("discloses truncation in the payload — a silently shortened document would let Tuto imply it read everything", () => {
      const parsed = JSON.parse(fitToolResultToBudget({ found: true, paragraphs: paragraphs(300, 60) }, 1500).content);

      expect(parsed._truncation).toBeDefined();
      expect(parsed._truncation.guidance).toMatch(/only on what is shown/i);
      expect(parsed._truncation.returned).toBeGreaterThan(0);
    });

    it("still returns valid JSON when even one item exceeds the whole budget", () => {
      const result = { found: true, paragraphs: [`${"enormous ".repeat(5000)}`] };
      const fitted = fitToolResultToBudget(result, 100);

      expect(() => JSON.parse(fitted.content)).not.toThrow();
      expect(fitted.truncated).toBe(true);
    });
  });

  describe("no trimmable array", () => {
    it("falls back to a partial-content notice that is still valid JSON", () => {
      const result = { found: true, body: "x".repeat(60_000) };
      const fitted = fitToolResultToBudget(result, 500);

      expect(fitted.truncated).toBe(true);
      const parsed = JSON.parse(fitted.content);
      expect(parsed._truncation.reason).toMatch(/no list structure/i);
      expect(typeof parsed.partialContent).toBe("string");
    });
  });

  it("does not treat an empty array as truncatable", () => {
    const result = { found: true, paragraphs: [], body: "y".repeat(40_000) };
    const parsed = JSON.parse(fitToolResultToBudget(result, 300).content);
    expect(parsed.partialContent).toBeDefined();
  });
});
