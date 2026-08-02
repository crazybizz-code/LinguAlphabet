import { describe, it, expect, beforeEach } from "vitest";
import { computeReadingDifficulty, estimateReadingTimeMinutes, generateEnrichment } from "./ai-processing";
import { getDefaultProvider, registerProvider } from "@/ai/providers";

describe("computeReadingDifficulty", () => {
  it("scores simple, short-sentence prose as easier than dense academic prose", () => {
    const simple = "The cat sat on the mat. The dog ran fast. We had fun today.";
    const dense =
      "Notwithstanding the epistemological considerations articulated previously, the methodological " +
      "framework necessitates a comprehensive reevaluation of the underlying theoretical presuppositions.";

    expect(computeReadingDifficulty(simple)).toBeGreaterThan(computeReadingDifficulty(dense));
  });

  it("clamps into the 0-100 range rather than emitting a raw out-of-band Flesch score", () => {
    const pathological =
      "Incomprehensibility notwithstanding interdisciplinary characterizations perpetuating " +
      "institutionalization internationalization counterrevolutionaries";
    const score = computeReadingDifficulty(pathological);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 0 for empty input instead of NaN", () => {
    expect(computeReadingDifficulty("")).toBe(0);
    expect(computeReadingDifficulty("   ")).toBe(0);
  });

  it("is deterministic — identical text always scores identically", () => {
    const text = "Learning a language takes time. Practice every day and you will improve.";
    expect(computeReadingDifficulty(text)).toBe(computeReadingDifficulty(text));
  });
});

describe("estimateReadingTimeMinutes", () => {
  it("never returns less than the two-minute floor", () => {
    expect(estimateReadingTimeMinutes("Three words here")).toBe(2);
  });

  it("scales with word count", () => {
    const long = Array.from({ length: 1000 }, () => "word").join(" ");
    expect(estimateReadingTimeMinutes(long)).toBe(5);
  });
});

/**
 * generateEnrichment had NO test at the model boundary before the
 * OpenRouter migration — only the deterministic helpers above were
 * covered. These fix the contract that the migration had to preserve, so
 * a future provider change cannot quietly alter what enrichment returns.
 */
describe("generateEnrichment", () => {
  const MODEL_OUTPUT = {
    cefrLevelMin: "B1",
    cefrLevelMax: "B2",
    topics: ["Science", "Not A Real Topic"],
    summary: "A summary of the episode.",
    keyExpressions: [{ expression: "run out of", meaning: "have none left", example: "We ran out of time." }],
    discussionQuestions: ["What surprised you?"],
    vocabulary: [
      { word: "bridge", phonetic: "brɪdʒ", pos: "noun", translation: "ko'prik", definition: "A structure.", example: "The bridge is long." },
      { word: "span", phonetic: "", pos: "verb", translation: "", definition: "To stretch across.", example: "It spans the river." },
    ],
    quiz: [
      { type: "mc", question: "Q1?", options: ["a", "b", "c", "d"], correct: 2, explanation: "Because.", grammarTopic: null, vocabularyWord: "bridge" },
      { type: "mc", question: "Q2?", options: ["a", "b"], correct: 0, explanation: "Also because.", grammarTopic: "  ", vocabularyWord: null },
    ],
    takeaways: ["One", "Two"],
    reflection: "How does this relate to you?",
    listeningNotes: ["Listen for linking."],
  };

  function installProvider(content: unknown) {
    getDefaultProvider();
    registerProvider({
      id: "openrouter",
      complete: async () => ({ content: JSON.stringify(content), finishReason: "stop" }),
      stream: async function* () {
        yield { delta: "", done: true };
      },
    });
  }

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";
  });

  it("filters topics to the controlled vocabulary but keeps the raw list", async () => {
    installProvider(MODEL_OUTPUT);
    const result = await generateEnrichment("Title", "Body", "audio");

    expect(result.topics).toEqual(["Science"]);
    expect(result.rawTopics).toEqual(["Science", "Not A Real Topic"]);
  });

  it("assigns quiz ids deterministically rather than trusting the model", async () => {
    installProvider(MODEL_OUTPUT);
    const result = await generateEnrichment("Title", "Body", "audio");

    expect(result.quiz.map((question) => question.id)).toEqual(["q1", "q2"]);
    expect(result.quiz.every((question) => question.type === "mc")).toBe(true);
  });

  it("normalizes null and whitespace-only tags to null", async () => {
    installProvider(MODEL_OUTPUT);
    const result = await generateEnrichment("Title", "Body", "audio");

    expect(result.quiz[0].grammarTopic).toBeNull();
    expect(result.quiz[0].vocabularyWord).toBe("bridge");
    // "  " is the model saying "none", not a tag.
    expect(result.quiz[1].grammarTopic).toBeNull();
    expect(result.quiz[1].vocabularyWord).toBeNull();
  });

  it("carries empty phonetic/translation through as empty strings", async () => {
    installProvider(MODEL_OUTPUT);
    const result = await generateEnrichment("Title", "Body", "audio");

    expect(result.vocabulary[0].phonetic).toBe("brɪdʒ");
    expect(result.vocabulary[1].phonetic).toBe("");
    expect(result.vocabulary[1].translation).toBe("");
  });

  it("returns only the modality's own notes, and no reading difficulty for audio", async () => {
    installProvider(MODEL_OUTPUT);
    const result = await generateEnrichment("Title", "Body", "audio");

    expect(result.listeningNotes).toEqual(["Listen for linking."]);
    expect(result.grammarNotes).toEqual([]);
    expect(result.readingDifficulty).toBeNull();
  });

  it("computes reading difficulty for text and asks for grammar notes instead", async () => {
    const textOutput: Record<string, unknown> = { ...MODEL_OUTPUT, grammarNotes: ["Passive voice."] };
    delete textOutput.listeningNotes;
    installProvider(textOutput);
    const result = await generateEnrichment("Title", "The cat sat on the mat. The dog ran fast.", "text");

    expect(result.grammarNotes).toEqual(["Passive voice."]);
    expect(result.listeningNotes).toEqual([]);
    expect(result.readingDifficulty).not.toBeNull();
  });

  it("fails closed on an invalid CEFR level instead of publishing it", async () => {
    installProvider({ ...MODEL_OUTPUT, cefrLevelMin: "Z9" });
    await expect(generateEnrichment("Title", "Body", "audio")).rejects.toThrow(/did not match/);
  });

  it("fails closed when a required field is missing", async () => {
    const withoutQuiz: Record<string, unknown> = { ...MODEL_OUTPUT };
    delete withoutQuiz.quiz;
    installProvider(withoutQuiz);
    await expect(generateEnrichment("Title", "Body", "audio")).rejects.toThrow(/did not match/);
  });
});
