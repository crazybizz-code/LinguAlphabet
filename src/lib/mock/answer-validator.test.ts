import { describe, expect, it } from "vitest";
import { validateIeltsAnswer } from "./answer-validator";

describe("validateIeltsAnswer", () => {
  it("accepts case and whitespace variants for text answers", () => {
    expect(validateIeltsAnswer({
      questionType: "sentence_completion",
      userAnswer: "  New   York ",
      correctAnswer: "new york",
    }).isCorrect).toBe(true);
  });

  it("accepts configured alternative answers", () => {
    expect(validateIeltsAnswer({
      questionType: "form_completion",
      userAnswer: "flat",
      correctAnswer: "apartment",
      acceptedAnswers: ["flat"],
      wordLimit: 1,
    }).isCorrect).toBe(true);
  });

  it("rejects answers above the IELTS word limit", () => {
    const result = validateIeltsAnswer({
      questionType: "note_completion",
      userAnswer: "very large apartment",
      correctAnswer: "apartment",
      wordLimit: 2,
    });
    expect(result.isCorrect).toBe(false);
    expect(result.reason).toBe("word_limit_exceeded");
  });

  it("validates matching mappings as a complete mapping", () => {
    expect(validateIeltsAnswer({
      questionType: "matching_headings",
      userAnswer: { A: "ii", B: "iv" },
      correctAnswer: { A: "ii", B: "iv" },
    }).isCorrect).toBe(true);

    expect(validateIeltsAnswer({
      questionType: "matching_headings",
      userAnswer: { A: "ii" },
      correctAnswer: { A: "ii", B: "iv" },
    }).isCorrect).toBe(false);
  });

  it("never treats an empty answer as correct", () => {
    const result = validateIeltsAnswer({
      questionType: "multiple_choice",
      userAnswer: "",
      correctAnswer: "B",
    });
    expect(result.reason).toBe("empty");
    expect(result.isCorrect).toBe(false);
  });
});
