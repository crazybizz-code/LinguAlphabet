import { describe, it, expect } from "vitest";
import { getSessionFlow } from "./types";

describe("getSessionFlow — PODCAST_FLOW", () => {
  const flow = getSessionFlow("podcast");

  it("contains 'reflection' between 'quiz' and 'summary'", () => {
    const quizIndex = flow.indexOf("quiz");
    const reflectionIndex = flow.indexOf("reflection");
    const summaryIndex = flow.indexOf("summary");
    expect(reflectionIndex).toBeGreaterThan(quizIndex);
    expect(summaryIndex).toBeGreaterThan(reflectionIndex);
  });

  it("begins with 'player'", () => {
    expect(flow[0]).toBe("player");
  });

  it("ends with 'complete'", () => {
    expect(flow[flow.length - 1]).toBe("complete");
  });

  it("has the exact order: player → vocabulary → flashcards → quiz → reflection → summary → complete", () => {
    expect(flow).toEqual(["player", "vocabulary", "flashcards", "quiz", "reflection", "summary", "complete"]);
  });
});

describe("getSessionFlow — ARTICLE_FLOW", () => {
  const flow = getSessionFlow("article");

  it("does NOT contain 'reflection'", () => {
    expect(flow).not.toContain("reflection");
  });

  it("begins with 'reading'", () => {
    expect(flow[0]).toBe("reading");
  });

  it("ends with 'complete'", () => {
    expect(flow[flow.length - 1]).toBe("complete");
  });

  it("has the exact pre-PR-B order: reading → dictionary → vocabulary → flashcards → quiz → summary → complete", () => {
    expect(flow).toEqual(["reading", "dictionary", "vocabulary", "flashcards", "quiz", "summary", "complete"]);
  });

  it("'quiz' is immediately followed by 'summary' with no reflection step between them", () => {
    const quizIndex = flow.indexOf("quiz");
    expect(flow[quizIndex + 1]).toBe("summary");
  });
});
