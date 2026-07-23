import type { ConversationMessage } from "@/ai/schemas";

/**
 * Turns "the learner selected this word" into the one user turn sent to
 * the AI Service. Tuto's identity/personality/context still comes from
 * buildTutoSystemPrompt() exactly as every other request (Sprint 1-3) —
 * this only supplies what's specific to a vocabulary lookup: the explicit
 * list of capabilities from the brief, and the instruction to answer in
 * JSON only (backed by generateStructuredResponse()'s provider-level
 * response_format, this is belt-and-braces, not the only enforcement).
 */
export function buildVocabularyRequestMessage(word: string): ConversationMessage {
  return {
    role: "user",
    content:
      `Explain the word "${word}" for me. Cover its meaning, a simple-English explanation, its Uzbek translation, ` +
      "pronunciation guidance, its CEFR level, its part of speech, common collocations, synonyms, antonyms, " +
      "example sentences, common mistakes learners make with it, and a memory tip to help remember it. " +
      "Respond with a single JSON object only, matching the required schema exactly — no text outside the JSON.",
  };
}
