import { generateJson } from "@/lib/gemini/client";
import type { QuizQuestion, VocabularyEntry } from "@/types/content";
import type { EnrichmentResult } from "./types";

/**
 * 3. AI Processing — the first real AI-based content enrichment in the
 * codebase (today's podcast summary/quiz, scripts/build-podcast-seed.mjs,
 * are template string-interpolation, not a model call). One function,
 * content-type-agnostic: title + raw body text in, the universal
 * enrichment attachments out (docs/domain-model.md's Podcast Model
 * section — Vocabulary/Quiz/Reflection/Takeaways apply to every content
 * type identically). Follows src/lib/vocabulary/lookup.ts's exact
 * convention: prompt string -> Gemini responseSchema -> JSON.parse ->
 * manual runtime validation before trusting the model's output. No
 * "use server" here (this isn't a form-invoked entry point, it's a
 * library function called by the pipeline/scripts — same posture as
 * gemini/client.ts itself).
 */

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    vocabulary: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          word: { type: "STRING" },
          phonetic: { type: "STRING" },
          pos: { type: "STRING" },
          translation: { type: "STRING" },
          definition: { type: "STRING" },
          example: { type: "STRING" },
        },
        required: ["word", "pos", "definition", "example"],
      },
    },
    quiz: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING" },
          question: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          correct: { type: "NUMBER" },
          explanation: { type: "STRING" },
        },
        required: ["type", "question", "options", "correct", "explanation"],
      },
    },
    takeaways: { type: "ARRAY", items: { type: "STRING" } },
    reflection: { type: "STRING" },
  },
  required: ["summary", "vocabulary", "quiz", "takeaways", "reflection"],
};

function buildPrompt(title: string, body: string): string {
  return `You are an English-learning content editor. Given this piece of content:

Title: "${title}"
Body: "${body}"

Return a JSON object with:
- summary: a 2-3 sentence plain-English recap of what this content teaches or covers.
- vocabulary: 5-8 key words or phrases from the content genuinely useful for an English learner, each with word, pos (part of speech), definition (simple, plain-language), example (a natural sentence using it, different from the source), translation (Uzbek translation), and phonetic (IPA, omit if uncertain).
- quiz: 3-4 multiple-choice comprehension/vocabulary questions, each with type ("mc"), question, options (4 plausible choices), correct (the 0-based index of the right option), and explanation (why that answer is correct).
- takeaways: 2-4 short bullet-point key takeaways from the content.
- reflection: one open-ended, low-pressure reflection prompt inviting the learner to relate the content to their own experience — never a test question.`;
}

function isVocabularyEntry(value: unknown): value is VocabularyEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.word === "string" &&
    typeof entry.pos === "string" &&
    typeof entry.definition === "string" &&
    typeof entry.example === "string"
  );
}

function isQuizQuestion(value: unknown): value is QuizQuestion {
  if (typeof value !== "object" || value === null) return false;
  const question = value as Record<string, unknown>;
  return (
    typeof question.question === "string" &&
    Array.isArray(question.options) &&
    question.options.every((option) => typeof option === "string") &&
    typeof question.correct === "number" &&
    typeof question.explanation === "string"
  );
}

/** Generates the universal enrichment attachments for any content type from its raw title + body text. */
export async function generateEnrichment(title: string, body: string): Promise<EnrichmentResult> {
  const raw = await generateJson(buildPrompt(title, body), RESPONSE_SCHEMA);
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("AI Processing: Gemini returned an unexpected response shape");
  }

  const result = parsed as Record<string, unknown>;

  if (
    typeof result.summary !== "string" ||
    !Array.isArray(result.vocabulary) ||
    !result.vocabulary.every(isVocabularyEntry) ||
    !Array.isArray(result.quiz) ||
    !result.quiz.every(isQuizQuestion) ||
    !Array.isArray(result.takeaways) ||
    !result.takeaways.every((takeaway) => typeof takeaway === "string") ||
    typeof result.reflection !== "string"
  ) {
    throw new Error("AI Processing: Gemini returned an unexpected response shape");
  }

  return {
    summary: result.summary,
    vocabulary: result.vocabulary.map((entry) => ({
      word: entry.word,
      phonetic: typeof entry.phonetic === "string" ? entry.phonetic : "",
      pos: entry.pos,
      translation: typeof entry.translation === "string" ? entry.translation : "",
      definition: entry.definition,
      example: entry.example,
    })),
    quiz: result.quiz.map((question) => ({
      type: "mc",
      question: question.question,
      options: question.options,
      correct: question.correct,
      explanation: question.explanation,
    })),
    takeaways: result.takeaways,
    reflection: result.reflection,
  };
}
