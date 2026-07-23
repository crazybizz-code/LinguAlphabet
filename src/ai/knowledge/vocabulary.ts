import type { KnowledgeVocabularyEntry } from "./types";

/**
 * Curated vocabulary entries (Sprint 8) — the same shape Vocabulary
 * Intelligence (Sprint 4) generates on demand, but here as consistent
 * source content for words LinguABC deliberately teaches, so different
 * learners asking about the same word get the same grounded answer.
 */
export const VOCABULARY_ENTRIES: Record<string, KnowledgeVocabularyEntry> = {
  reckon: {
    word: "reckon",
    partOfSpeech: "verb",
    meaning: "to think or believe something, often used informally",
    cefrLevel: "B2",
    collocations: ["reckon that", "reckon on", "reckon with"],
    commonMistakes: ["Using 'reckon' in formal writing, where 'consider' or 'believe' fits better."],
    synonyms: ["think", "suppose", "believe"],
    antonyms: ["doubt"],
    examples: [{ sentence: "I reckon it'll rain later.", note: "casual, spoken English" }],
  },

  procrastinate: {
    word: "procrastinate",
    partOfSpeech: "verb",
    meaning: "to delay doing something that should be done, usually because it's unpleasant or difficult",
    cefrLevel: "B2",
    collocations: ["procrastinate on a task", "tend to procrastinate"],
    commonMistakes: [
      "Confusing it with 'postpone', which means deliberately delaying a planned event, not avoiding an unwanted one.",
    ],
    synonyms: ["delay", "put off", "stall"],
    antonyms: ["expedite"],
    examples: [{ sentence: "I always procrastinate before exams.", note: "admitting a habit" }],
  },

  negotiate: {
    word: "negotiate",
    partOfSpeech: "verb",
    meaning: "to discuss something formally in order to reach an agreement",
    cefrLevel: "B1",
    collocations: ["negotiate a deal", "negotiate with someone", "negotiate terms"],
    commonMistakes: [
      "Using it interchangeably with 'discuss' — negotiating implies working toward a compromise, not just talking.",
    ],
    synonyms: ["bargain", "mediate"],
    antonyms: ["dictate"],
    examples: [{ sentence: "They negotiated a better salary before accepting the job.", note: "common in career contexts" }],
  },

  substantiate: {
    word: "substantiate",
    partOfSpeech: "verb",
    meaning: "to provide evidence that proves or supports a claim",
    cefrLevel: "C1",
    collocations: ["substantiate a claim", "substantiate an argument"],
    commonMistakes: ["Using it as a synonym for 'mention' — it specifically means backing something up with evidence."],
    synonyms: ["corroborate", "verify"],
    antonyms: ["refute"],
    examples: [
      { sentence: "The essay's main argument is never substantiated with real examples.", note: "common in exam-essay feedback" },
    ],
  },

  commute: {
    word: "commute",
    partOfSpeech: "verb / noun",
    meaning: "to travel regularly between home and work",
    cefrLevel: "B1",
    collocations: ["commute to work", "a long commute", "daily commute"],
    commonMistakes: ["Confusing it with 'commit' — a different word with a completely different meaning."],
    synonyms: ["travel to work"],
    antonyms: [],
    examples: [{ sentence: "My commute takes about 40 minutes each way.", note: "noun use" }],
  },
};
