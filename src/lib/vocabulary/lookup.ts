"use server";

import { generateJson } from "@/lib/gemini/client";
import type { VocabularyEntry } from "@/types/content";

export type WordLookupResult = { success: true; entry: VocabularyEntry } | { success: false; error: string };

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    definition: { type: "STRING" },
    partOfSpeech: { type: "STRING" },
    translationUzbek: { type: "STRING" },
    example: { type: "STRING" },
    phonetic: { type: "STRING" },
  },
  required: ["definition", "partOfSpeech", "translationUzbek", "example"],
};

/**
 * On-demand definition for words outside a lesson's curated vocabulary list
 * (which stays instant and free — see adapters/podcast.ts). A real model
 * call, not a fabricated fallback: it genuinely generates a definition for
 * whatever word the learner clicked, disambiguated by the sentence it
 * appeared in, rather than showing nothing for the ~800 non-curated words
 * in a typical transcript.
 */
export async function lookupWord(word: string, context: string): Promise<WordLookupResult> {
  const prompt = `You are a dictionary for English learners. Given the word "${word}" as it appears in this sentence: "${context}"

Return a JSON object with:
- definition: a simple, clear English definition of "${word}" as used in this specific sentence (one sentence, plain language, suitable for a B1/B2 English learner)
- partOfSpeech: the part of speech (e.g. "Noun", "Verb", "Adjective", "Phrasal verb")
- translationUzbek: the Uzbek translation of "${word}" as used in this sense
- example: a short, natural example sentence using "${word}" in the same sense (different from the sentence given)
- phonetic: the IPA pronunciation of "${word}" without slashes (omit if uncertain)`;

  try {
    const raw = await generateJson(prompt, RESPONSE_SCHEMA);
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).definition !== "string" ||
      typeof (parsed as Record<string, unknown>).partOfSpeech !== "string" ||
      typeof (parsed as Record<string, unknown>).translationUzbek !== "string" ||
      typeof (parsed as Record<string, unknown>).example !== "string"
    ) {
      return { success: false, error: "Gemini returned an unexpected response shape" };
    }

    const result = parsed as {
      definition: string;
      partOfSpeech: string;
      translationUzbek: string;
      example: string;
      phonetic?: unknown;
    };

    return {
      success: true,
      entry: {
        word,
        phonetic: typeof result.phonetic === "string" ? result.phonetic : "",
        pos: result.partOfSpeech,
        translation: result.translationUzbek,
        definition: result.definition,
        example: result.example,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Word lookup failed" };
  }
}
