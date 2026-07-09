import type { ContentItem, QuizQuestion, TranscriptSegment, VocabularyEntry } from "@/types/content";

/**
 * The Learning Session's own content shape — deliberately NOT `PodcastContent`.
 * Every step component (Player/Summary/Vocabulary/Flashcards/Quiz/Reflection/
 * Complete) consumes only this, so the pipeline is content-type agnostic:
 * Podcast is simply the first adapter (./adapters/podcast.ts) that produces
 * one. A future Article/Story/Video/Conversation adds its own adapter — the
 * step components and the state machine never change. `audioUrl`/
 * `durationSeconds`/`transcript` are podcast-shaped fields that happen to sit
 * on the universal type for now (matching how a text-only future content
 * type would simply leave `audioUrl` empty and skip playback UI) rather than
 * forcing an early content-type branch into the state machine.
 */
export interface LearningSessionContent {
  contentId: string;
  contentType: ContentItem["contentType"];
  title: string;
  cefrLevel: string;
  topics: string[];
  estimatedMinutes: number;
  audioUrl: string;
  durationSeconds: number;
  transcript: TranscriptSegment[];
  summary: string;
  vocabulary: VocabularyEntry[];
  quiz: QuizQuestion[];
  reflectionPrompt: string;
}

export const SESSION_STEPS = ["player", "summary", "vocabulary", "flashcards", "quiz", "reflection", "complete"] as const;
export type SessionStep = (typeof SESSION_STEPS)[number];

export const SESSION_STEP_LABELS: Record<SessionStep, string> = {
  player: "Listen",
  summary: "Summary",
  vocabulary: "Vocabulary",
  flashcards: "Flashcards",
  quiz: "Quiz",
  reflection: "Reflect",
  complete: "Complete",
};
