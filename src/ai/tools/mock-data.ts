/**
 * Realistic static mock records for the two tools that don't yet have a
 * real repository behind them (getSelectedVocabulary, getLearningProgress
 * — see docs/ai-coach-audit.md, rated lower severity since a real
 * vocabulary/progress path already exists elsewhere in the app). The five
 * content-reading tools (getCurrentArticle, getArticleParagraphs,
 * getCurrentPodcast, getPodcastTranscript, getCurrentQuiz) were moved off
 * mock data onto src/ai/data's ContentRepository.
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

export const MOCK_PROGRESS = {
  totalLessonsCompleted: 42,
  weeklyGoalMinutes: 150,
  weeklyMinutesSoFar: 95,
  longestStreak: 21,
};
