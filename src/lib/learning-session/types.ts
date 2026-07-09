import type { ContentItem, QuizQuestion, VocabularyEntry } from "@/types/content";

/**
 * The Learning Session's own content shape — deliberately NOT `PodcastContent`.
 * Every step component (Summary/Vocabulary/Flashcards/Quiz/Reflection/Complete)
 * consumes only this, so the pipeline is content-type agnostic: Podcast is
 * simply the first adapter (./adapters/podcast.ts) that produces one. A
 * future Article/Story/Video/Conversation adds its own adapter — the step
 * components and the state machine never change.
 */
export interface LearningSessionContent {
  contentId: string;
  contentType: ContentItem["contentType"];
  title: string;
  cefrLevel: string;
  topics: string[];
  estimatedMinutes: number;
  summary: string;
  vocabulary: VocabularyEntry[];
  quiz: QuizQuestion[];
  reflectionPrompt: string;
}

export const SESSION_STEPS = ["summary", "vocabulary", "flashcards", "quiz", "reflection", "complete"] as const;
export type SessionStep = (typeof SESSION_STEPS)[number];

export const SESSION_STEP_LABELS: Record<SessionStep, string> = {
  summary: "Summary",
  vocabulary: "Vocabulary",
  flashcards: "Flashcards",
  quiz: "Quiz",
  reflection: "Reflect",
  complete: "Complete",
};
