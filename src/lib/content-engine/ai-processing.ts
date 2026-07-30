import { generateJson } from "@/lib/gemini/client";
import type { CefrLevel, QuizQuestion, VocabularyEntry } from "@/types/content";
import { CONTROLLED_TOPICS } from "@/lib/constants/topics";
import type { ContentModality, EnrichmentResult, KeyExpression } from "./types";

const CEFR_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === "string" && (CEFR_LEVELS as readonly string[]).includes(value);
}

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

const KEY_EXPRESSION_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      expression: { type: "STRING" },
      meaning: { type: "STRING" },
      example: { type: "STRING" },
    },
    required: ["expression", "meaning", "example"],
  },
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    cefrLevelMin: { type: "STRING" },
    cefrLevelMax: { type: "STRING" },
    topics: { type: "ARRAY", items: { type: "STRING" } },
    summary: { type: "STRING" },
    keyExpressions: KEY_EXPRESSION_SCHEMA,
    discussionQuestions: { type: "ARRAY", items: { type: "STRING" } },
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
          grammarTopic: { type: "STRING" },
          vocabularyWord: { type: "STRING" },
        },
        required: ["type", "question", "options", "correct", "explanation"],
      },
    },
    takeaways: { type: "ARRAY", items: { type: "STRING" } },
    reflection: { type: "STRING" },
  },
  required: [
    "cefrLevelMin",
    "cefrLevelMax",
    "topics",
    "summary",
    "vocabulary",
    "quiz",
    "takeaways",
    "reflection",
    "keyExpressions",
    "discussionQuestions",
  ],
};

/**
 * Built per-modality rather than one union schema with half the fields
 * always empty: asking the model for `listeningNotes` on an article is
 * an invitation to hallucinate something plausible-sounding about audio
 * that doesn't exist. Declared after RESPONSE_SCHEMA it spreads, so there
 * is no temporal-dead-zone hazard if this is ever called at module scope.
 */
function buildResponseSchema(modality: ContentModality) {
  const modalityNotes =
    modality === "audio"
      ? { listeningNotes: { type: "ARRAY", items: { type: "STRING" } } }
      : { grammarNotes: { type: "ARRAY", items: { type: "STRING" } } };
  const modalityRequired = modality === "audio" ? ["listeningNotes"] : ["grammarNotes"];

  return {
    ...RESPONSE_SCHEMA,
    properties: { ...RESPONSE_SCHEMA.properties, ...modalityNotes },
    required: [...RESPONSE_SCHEMA.required, ...modalityRequired],
  };
}

function buildPrompt(title: string, body: string, modality: ContentModality): string {
  const sourceLabel = modality === "audio" ? "transcript of an audio episode" : "written article";
  const modalityInstruction =
    modality === "audio"
      ? `- listeningNotes: 3-5 short, concrete notes on what a learner should LISTEN for in this audio — speaker pace, accent features, reductions/linking, discourse signposts, or moments where meaning depends on intonation. Base these only on what the transcript actually evidences (e.g. visible false starts, interruptions, filler words); never speculate about audio qualities the transcript gives no evidence for.`
      : `- grammarNotes: 3-5 short notes on grammar structures this passage genuinely exercises (e.g. "passive voice for reporting findings", "third conditional"), each naming the structure and pointing at how the text uses it. Only structures actually present in the text.`;

  return `You are an English-learning content editor. Given this ${sourceLabel}:

Title: "${title}"
Body: "${body}"

Return a JSON object with:
- keyExpressions: 3-5 multi-word expressions (idioms, collocations, phrasal verbs) from the content worth teaching as a unit, each with expression (as it appears), meaning (plain language), and example (a natural sentence using it, different from the source). These must be MULTI-WORD phrases — single words belong in vocabulary, not here.
- discussionQuestions: 3-4 open-ended questions a teacher or study partner could use to discuss this content. Each should invite opinion or analysis, never have a single lookup-able right answer (that's what quiz is for).
${modalityInstruction}
- cefrLevelMin: the easiest CEFR level (one of A1, A2, B1, B2, C1, C2) a learner could still get value from this content at.
- cefrLevelMax: the hardest CEFR level (same six values) this content still meaningfully suits — equal to cefrLevelMin if it's narrowly aimed at one level.
- topics: 1-3 topics that best describe this content, chosen ONLY from this exact list, verbatim: ${CONTROLLED_TOPICS.join(", ")}. Never invent a topic outside this list — if nothing fits well, return an empty array.
- summary: a 2-3 sentence plain-English recap of what this content teaches or covers.
- vocabulary: 5-8 key words or phrases from the content genuinely useful for an English learner, each with word, pos (part of speech), definition (simple, plain-language), example (a natural sentence using it, different from the source), translation (Uzbek translation), and phonetic (IPA, omit if uncertain).
- quiz: 3-4 multiple-choice comprehension/vocabulary questions, each with type ("mc"), question, options (4 plausible choices), correct (the 0-based index of the right option), explanation (why that answer is correct), grammarTopic (a short, specific grammar-unit label like "present-perfect" or "reported-speech" ONLY if this question specifically tests that grammar point — omit or leave empty for a plain comprehension question, most will not have one), and vocabularyWord (the exact word from the vocabulary list above this question tests, ONLY if it's a vocabulary question — omit otherwise).
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
    typeof question.explanation === "string" &&
    (question.grammarTopic === undefined || typeof question.grammarTopic === "string") &&
    (question.vocabularyWord === undefined || typeof question.vocabularyWord === "string")
  );
}

function isKeyExpression(value: unknown): value is KeyExpression {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.expression === "string" && typeof entry.meaning === "string" && typeof entry.example === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Empty/whitespace-only counts as "not tagged" — Gemini sometimes returns "" instead of omitting the field. */
function normalizeTag(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Generates the universal enrichment attachments for any content type
 * from its raw title + body text. `modality` selects which of the two
 * modality-specific note sets is requested (listening vs grammar) — the
 * ONE processor both the Article and Podcast adapters call, per the
 * Content Engine's shared-engine rule. A podcast's "body" is its verified
 * transcript text; nothing here knows or cares that it came from audio,
 * which is exactly why swapping a manual transcript for an ASR-generated
 * one later requires no change in this file.
 */
export async function generateEnrichment(
  title: string,
  body: string,
  modality: ContentModality = "text",
): Promise<EnrichmentResult> {
  const raw = await generateJson(buildPrompt(title, body, modality), buildResponseSchema(modality));
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("AI Processing: Gemini returned an unexpected response shape");
  }

  const result = parsed as Record<string, unknown>;

  if (
    !isCefrLevel(result.cefrLevelMin) ||
    !isCefrLevel(result.cefrLevelMax) ||
    !Array.isArray(result.topics) ||
    !result.topics.every((topic) => typeof topic === "string") ||
    typeof result.summary !== "string" ||
    !Array.isArray(result.vocabulary) ||
    !result.vocabulary.every(isVocabularyEntry) ||
    !Array.isArray(result.quiz) ||
    !result.quiz.every(isQuizQuestion) ||
    !Array.isArray(result.takeaways) ||
    !result.takeaways.every((takeaway) => typeof takeaway === "string") ||
    typeof result.reflection !== "string" ||
    !Array.isArray(result.keyExpressions) ||
    !result.keyExpressions.every(isKeyExpression) ||
    !isStringArray(result.discussionQuestions)
  ) {
    throw new Error("AI Processing: Gemini returned an unexpected response shape");
  }

  // Only the modality's own note field is required — the other is absent
  // by construction (buildResponseSchema never asks for it).
  const listeningNotes = modality === "audio" ? result.listeningNotes : [];
  const grammarNotes = modality === "text" ? result.grammarNotes : [];
  if (!isStringArray(listeningNotes) || !isStringArray(grammarNotes)) {
    throw new Error("AI Processing: Gemini returned an unexpected response shape");
  }

  const controlledTopics: readonly string[] = CONTROLLED_TOPICS;

  return {
    cefrLevelMin: result.cefrLevelMin,
    cefrLevelMax: result.cefrLevelMax,
    // Drop anything Gemini hallucinated outside the controlled vocabulary
    // from `topics` — but keep the full list in `rawTopics` so it isn't
    // simply thrown away (see EnrichmentResult's rawTopics doc comment).
    topics: result.topics.filter((topic) => controlledTopics.includes(topic)),
    rawTopics: result.topics,
    summary: result.summary,
    vocabulary: result.vocabulary.map((entry) => ({
      word: entry.word,
      phonetic: typeof entry.phonetic === "string" ? entry.phonetic : "",
      pos: entry.pos,
      translation: typeof entry.translation === "string" ? entry.translation : "",
      definition: entry.definition,
      example: entry.example,
    })),
    quiz: result.quiz.map((question, index) => ({
      // Assigned deterministically, never trusted from the model — id
      // uniqueness/stability shouldn't depend on Gemini getting it right.
      id: `q${index + 1}`,
      type: "mc",
      question: question.question,
      options: question.options,
      correct: question.correct,
      explanation: question.explanation,
      grammarTopic: normalizeTag(question.grammarTopic),
      vocabularyWord: normalizeTag(question.vocabularyWord),
    })),
    takeaways: result.takeaways,
    reflection: result.reflection,
    keyExpressions: result.keyExpressions.map((entry) => ({
      expression: entry.expression,
      meaning: entry.meaning,
      example: entry.example,
    })),
    discussionQuestions: result.discussionQuestions,
    listeningNotes,
    grammarNotes,
    // Deterministic, never asked of the model — see the field's doc comment.
    readingDifficulty: modality === "text" ? computeReadingDifficulty(body) : null,
  };
}

/**
 * Maps an EnrichmentResult onto the `*_details` columns that store it.
 * The single place that translation happens, shared by the scheduled
 * article pipeline and the human-in-the-loop podcast path so the two can
 * never drift on column naming or on which fields a modality carries.
 *
 * Universal fields go to both tables (they have identical column names by
 * design); modality-specific ones are emitted only for the modality that
 * actually produced them, so an article never writes an empty
 * listening_notes and a podcast never writes a meaningless
 * reading_difficulty.
 */
export function enrichmentToDetailsColumns(
  enrichment: EnrichmentResult,
  modality: ContentModality,
): Record<string, unknown> {
  const universal = {
    summary: enrichment.summary,
    takeaways: enrichment.takeaways,
    vocabulary: enrichment.vocabulary,
    quiz: enrichment.quiz,
    reflection: enrichment.reflection,
    key_expressions: enrichment.keyExpressions,
    discussion_questions: enrichment.discussionQuestions,
  };

  return modality === "audio"
    ? { ...universal, listening_notes: enrichment.listeningNotes }
    : { ...universal, grammar_notes: enrichment.grammarNotes, reading_difficulty: enrichment.readingDifficulty };
}

function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (cleaned.length === 0) return 0;
  if (cleaned.length <= 3) return 1;
  const groups = cleaned
    .replace(/(?:es|ed|[^aeiou]e)$/, "")
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/**
 * Flesch Reading Ease (0-100, higher = easier), clamped. Deterministic
 * for the same reason estimateReadingTimeMinutes is: a language model is
 * unreliable at exact word/syllable counting, and a difficulty score that
 * silently drifts run-to-run for identical text is worse than no score.
 */
export function computeReadingDifficulty(body: string): number {
  const text = body.trim();
  if (!text) return 0;

  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((part) => part.trim().length > 0).length || 1;
  const wordList = text.split(/\s+/).filter(Boolean);
  if (wordList.length === 0) return 0;

  const syllables = wordList.reduce((sum, word) => sum + countSyllables(word), 0);
  const score = 206.835 - 1.015 * (wordList.length / sentences) - 84.6 * (syllables / wordList.length);
  return Math.round(Math.min(100, Math.max(0, score)));
}

const WORDS_PER_MINUTE = 200;

/**
 * Deterministic reading-time estimate — never asked of Gemini, which is
 * unreliable at precise word counting. A floor of 2 minutes keeps very
 * short content from ever reading as instantaneous.
 */
export function estimateReadingTimeMinutes(body: string): number {
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(wordCount / WORDS_PER_MINUTE));
}
