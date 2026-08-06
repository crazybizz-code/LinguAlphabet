import { z } from "zod";
import { generateStructuredJson } from "@/ai/services/generate-structured-json";
import { AIProviderError } from "@/ai/providers";
import { BATCH_RETRY_POLICY } from "@/ai/retry";
import { CONTROLLED_TOPICS } from "@/lib/constants/topics";
import { cefrIndex } from "@/lib/learning-brain/cefr";
import type { ContentModality, EnrichmentResult } from "./types";

/**
 * 3. AI Processing — the first real AI-based content enrichment in the
 * codebase (today's podcast summary/quiz, scripts/build-podcast-seed.mjs,
 * are template string-interpolation, not a model call). One function,
 * content-type-agnostic: title + raw body text in, the universal
 * enrichment attachments out (docs/domain-model.md's Podcast Model
 * section — Vocabulary/Quiz/Reflection/Takeaways apply to every content
 * type identically).
 *
 * Reaches the model through the shared AI gateway
 * (src/ai/services/generate-structured-json.ts -> src/ai/providers ->
 * OpenRouter), not a provider-specific client. The model is still Gemini;
 * which model that is belongs to OPENROUTER_MODEL, so changing it is a
 * config change rather than a code change, and enrichment now shares one
 * integration with Tuto instead of maintaining a second.
 *
 * No "use server" here (this isn't a form-invoked entry point, it's a
 * library function called by the pipeline/scripts).
 */

/**
 * The enrichment contract, as Zod.
 *
 * Replaces a hand-written Google `responseSchema` (`type: "OBJECT"`,
 * `"STRING"`) because the model is now reached through the OpenRouter
 * gateway, which speaks standard JSON Schema. Zod is the source of truth
 * for both directions at once: `z.toJSONSchema()` constrains what the
 * model may return, and `safeParse()` validates what it did — so the
 * request and the check can no longer drift apart, which they could when
 * the wire schema and the hand-rolled `isQuizQuestion`-style guards were
 * maintained separately.
 *
 * CEFR levels are an enum rather than a string, which is strictly
 * stronger than the old `isCefrLevel()` check: an invalid level is now
 * refused by the model's own decoder, not caught afterwards.
 *
 * REQUIREDNESS CHANGED SHAPE, NOT MEANING. Structured outputs are strict:
 * every property must be present. Fields the old schema let the model
 * omit are therefore declared explicitly — `phonetic` and `translation`
 * as strings the model may leave empty, `grammarTopic` and
 * `vocabularyWord` as nullable because "this question tests no grammar
 * point" is real information and an empty string would blur it. The
 * mapping below normalizes both to exactly what it produced before.
 */
const CEFR_LEVEL = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

const KeyExpressionSchema = z.object({
  expression: z.string(),
  meaning: z.string(),
  example: z.string(),
});

const VocabularySchema = z.object({
  word: z.string(),
  phonetic: z.string(),
  pos: z.string(),
  translation: z.string(),
  definition: z.string(),
  example: z.string(),
});

const QuizSchema = z.object({
  type: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  correct: z.number(),
  explanation: z.string(),
  grammarTopic: z.string().nullable(),
  vocabularyWord: z.string().nullable(),
});

const BASE_ENRICHMENT_FIELDS = {
  cefrLevelMin: CEFR_LEVEL,
  cefrLevelMax: CEFR_LEVEL,
  topics: z.array(z.string()),
  summary: z.string(),
  keyExpressions: z.array(KeyExpressionSchema),
  discussionQuestions: z.array(z.string()),
  vocabulary: z.array(VocabularySchema),
  quiz: z.array(QuizSchema),
  takeaways: z.array(z.string()),
  reflection: z.string(),
};

/**
 * Built per-modality rather than one union schema with half the fields
 * always empty: asking the model for `listeningNotes` on an article is
 * an invitation to hallucinate something plausible-sounding about audio
 * that doesn't exist.
 */
type EnrichmentModelOutput = z.infer<z.ZodObject<typeof BASE_ENRICHMENT_FIELDS>> & {
  /** Exactly one of these is ever present, decided by the modality that built the schema. */
  listeningNotes?: string[];
  grammarNotes?: string[];
};

function buildEnrichmentSchema(modality: ContentModality): z.ZodType<EnrichmentModelOutput> {
  return modality === "audio"
    ? z.object({ ...BASE_ENRICHMENT_FIELDS, listeningNotes: z.array(z.string()) })
    : z.object({ ...BASE_ENRICHMENT_FIELDS, grammarNotes: z.array(z.string()) });
}

export function buildPrompt(title: string, body: string, modality: ContentModality): string {
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
- cefrLevelMin: the LOWEST CEFR level at which a learner can independently understand approximately 70% of this content without extensive external help. Do NOT default to A1 out of generosity — if the content primarily requires B1 knowledge to follow, set cefrLevelMin to B1. Use this rubric: A1 = absolute beginner (very familiar basic words, present tense and 'be' verb only, zero unknown vocabulary); A2 = elementary (common everyday words, simple past, basic connectors like and/but/so, short sentences on familiar topics such as shopping or family); B1 = intermediate (everyday conversations and introduced abstract topics, some idioms and phrasal verbs, past/present/future used fluently); B2 = upper-intermediate (extended discussion of complex or abstract topics, conditional sentences, nuanced vocabulary, requires solid fluency); C1 = advanced (implicit meaning, irony, dense vocabulary, cultural references, spontaneous or technical language for near-fluent speakers); C2 = mastery (near-native level, highly abstract or technical or culturally embedded, essentially no simplification, only near-native speakers reach 70% independently).
- cefrLevelMax: the HIGHEST CEFR level this content still meaningfully serves. Assess this INDEPENDENTLY from cefrLevelMin — do NOT default it to equal cefrLevelMin. Most English-learning content spans at least one level: a B1-calibrated piece often remains engaging and useful through B2, so cefrLevelMax should be B2 in that case. Only set cefrLevelMax equal to cefrLevelMin if the content is so precisely targeted that it genuinely offers nothing new to a learner above the minimum level.
- topics: 1-3 topics that best describe this content, chosen ONLY from this exact list, verbatim: ${CONTROLLED_TOPICS.join(", ")}. Never invent a topic outside this list — if nothing fits well, return an empty array.
- summary: a 2-3 sentence plain-English recap of what this content teaches or covers.
- vocabulary: 5-8 key words or phrases from the content genuinely useful for an English learner, each with word, pos (part of speech), definition (simple, plain-language), example (a natural sentence using it, different from the source), translation (Uzbek translation), and phonetic (IPA, or an empty string if uncertain).
- quiz: 3-4 multiple-choice comprehension/vocabulary questions, each with type ("mc"), question, options (4 plausible choices), correct (the 0-based index of the right option), explanation (why that answer is correct), grammarTopic (a short, specific grammar-unit label like "present-perfect" or "reported-speech" ONLY if this question specifically tests that grammar point — null for a plain comprehension question, most will be null), and vocabularyWord (the exact word from the vocabulary list above this question tests, ONLY if it's a vocabulary question — null otherwise).
- takeaways: 2-4 short bullet-point key takeaways from the content.
- reflection: one open-ended, low-pressure reflection prompt inviting the learner to relate the content to their own experience — never a test question.`;
}

/** Empty/whitespace-only counts as "not tagged" — a model sometimes returns "" instead of null. */
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
  // Through the shared AI gateway (OpenRouter), not a provider-specific
  // client. The model is still Gemini — that is OPENROUTER_MODEL's job,
  // and changing it is a config change rather than a code change.
  //
  // BATCH_RETRY_POLICY is passed explicitly: this is ingestion, where a
  // 429 means "we asked faster than the quota allows" and waiting is the
  // correct response. Interactive callers deliberately get no retries.
  const result = await generateStructuredJson({
    messages: [{ role: "user", content: buildPrompt(title, body, modality) }],
    schema: buildEnrichmentSchema(modality),
    schemaName: "content_enrichment",
    retryPolicy: BATCH_RETRY_POLICY,
  });

  // Ordering invariant: cefrLevelMin must be ≤ cefrLevelMax. The Zod enum
  // already rejects values outside the six-level set; this catches the
  // remaining case where both values are individually valid but their order
  // is wrong (e.g. B2/A1). Same AIProviderError shape as generateStructuredJson's
  // schema-mismatch path — non-retryable (a model that reversed the levels
  // once will reverse them again).
  if (cefrIndex(result.cefrLevelMin) > cefrIndex(result.cefrLevelMax)) {
    throw new AIProviderError(
      `The model returned a reversed CEFR range for "content_enrichment": cefrLevelMin "${result.cefrLevelMin}" is above cefrLevelMax "${result.cefrLevelMax}".`,
      502,
      false,
    );
  }

  // Only the modality's own note field is requested — the other is absent
  // by construction (buildEnrichmentSchema never asks for it).
  const listeningNotes = result.listeningNotes ?? [];
  const grammarNotes = result.grammarNotes ?? [];

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
