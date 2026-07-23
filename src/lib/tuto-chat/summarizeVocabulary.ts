import type { VocabularyExplanation } from "./askVocabulary";

/**
 * A short, natural-language recap of a VocabularyExplanation — used as a
 * hidden seed message (ChatMessage.hidden) so a follow-up question in the
 * same conversation has continuity ("I already explained this word, don't
 * repeat yourself") without ever showing the learner a JSON dump or a
 * duplicate of the card they're already looking at.
 */
export function summarizeVocabularyForHistory(explanation: VocabularyExplanation): string {
  const { word, meaning } = explanation.vocabularyItem;
  return `I just explained the word "${word}" to the learner: ${meaning}`;
}
