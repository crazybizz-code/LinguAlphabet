import { describe, it, expect } from "vitest";
import { estimateChunkedRevealDurationMs } from "./useChunkedReveal";

describe("estimateChunkedRevealDurationMs", () => {
  it("never returns less than the minimum floor, even for an empty string", () => {
    expect(estimateChunkedRevealDurationMs("")).toBeGreaterThan(0);
  });

  it("takes longer for text with more sentence breaks, at the same word count", () => {
    const oneSentence = "the quick brown fox jumps over the lazy dog and then keeps running";
    const fourSentences = "The quick fox jumps. Over the lazy dog. And then it keeps. Running fast today.";
    expect(estimateChunkedRevealDurationMs(fourSentences)).toBeGreaterThan(estimateChunkedRevealDurationMs(oneSentence));
  });

  it("takes longer across a paragraph break than the same words on one line", () => {
    const onePara = "First idea continues right into the second idea without a break at all here";
    const twoPara = "First idea continues right into the\n\nsecond idea with a break at all here";
    expect(estimateChunkedRevealDurationMs(twoPara)).toBeGreaterThan(estimateChunkedRevealDurationMs(onePara));
  });

  it("scales up for longer replies rather than capping at a fixed ceiling", () => {
    const short = "A short reply with just a few words in it.";
    const long = Array.from({ length: 12 }, () => short).join(" ");
    expect(estimateChunkedRevealDurationMs(long)).toBeGreaterThan(estimateChunkedRevealDurationMs(short) * 5);
  });
});
