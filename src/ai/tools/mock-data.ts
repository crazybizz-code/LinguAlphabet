/**
 * Realistic static mock records for the one tool that doesn't yet have a
 * real repository behind it (getSelectedVocabulary — see
 * docs/mvp-completion-audit.md P1.5, rated lower severity since a real
 * vocabulary lookup path already exists elsewhere in the app). The five
 * content-reading tools (getCurrentArticle, getArticleParagraphs,
 * getCurrentPodcast, getPodcastTranscript, getCurrentQuiz) were moved off
 * mock data onto src/ai/data's ContentRepository; getLearningProgress was
 * moved onto LearnerRepository/SignalRepository (docs/mvp-completion-audit.md P0.1).
 */

export interface MockVocabularyEntry {
  word: string;
  partOfSpeech: string;
  definition: string;
  exampleSentence: string;
  cefrLevel: string;
}

export const MOCK_VOCABULARY: Record<string, MockVocabularyEntry> = {
  "couldn't agree more": {
    word: "couldn't agree more",
    partOfSpeech: "idiom",
    definition: "Used to express complete agreement with what someone just said.",
    exampleSentence: "\"This coffee is amazing.\" \"I couldn't agree more.\"",
    cefrLevel: "B1",
  },
  reckon: {
    word: "reckon",
    partOfSpeech: "verb",
    definition: "To think or believe something, often used informally.",
    exampleSentence: "I reckon it's going to rain later.",
    cefrLevel: "B2",
  },
};
