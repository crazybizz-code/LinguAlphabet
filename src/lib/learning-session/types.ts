import type { ContentItem, QuizQuestion, TranscriptSegment, VocabularyEntry } from "@/types/content";

/**
 * The Learning Session's own content shape — deliberately NOT `PodcastContent`
 * or `ArticleContent`. Every step component (Player/Reading/Dictionary/
 * Summary/Vocabulary/Flashcards/Quiz/Reflection/Complete) consumes only
 * this, so the pipeline is content-type agnostic: Podcast and Article are
 * simply two adapters (./adapters/podcast.ts, ./adapters/article.ts) that
 * produce one. A future Story/Video/Conversation adds its own adapter — the
 * step components and the state machine never change. `audioUrl`/
 * `durationSeconds`/`transcript` are podcast-shaped fields and `paragraphs`
 * is article-shaped — each adapter only ever fills in its own, leaving the
 * other empty, rather than forcing a content-type branch into the state
 * machine.
 */
export interface LearningSessionContent {
  contentId: string;
  contentType: ContentItem["contentType"];
  title: string;
  cefrLevel: string;
  topics: string[];
  estimatedMinutes: number;
  thumbnailUrl: string;
  audioUrl: string;
  durationSeconds: number;
  transcript: TranscriptSegment[];
  /** Article body, pre-split into readable paragraphs by the article adapter — empty for podcast. */
  paragraphs: string[];
  /** The original source's URL — populated by the article adapter when the content is externally sourced (e.g. RSS ingestion); empty for podcast and for anything without one. Several approved sources (docs/content-source-policy.md) require visible attribution + a link back, which this exists to satisfy. */
  sourceUrl: string;
  summary: string;
  vocabulary: VocabularyEntry[];
  quiz: QuizQuestion[];
  reflectionPrompt: string;
}

export const SESSION_STEPS = [
  "player",
  "reading",
  "dictionary",
  "summary",
  "vocabulary",
  "flashcards",
  "quiz",
  "reflection",
  "complete",
] as const;
export type SessionStep = (typeof SESSION_STEPS)[number];

export const SESSION_STEP_LABELS: Record<SessionStep, string> = {
  player: "Listen",
  reading: "Read",
  dictionary: "Dictionary",
  summary: "Summary",
  vocabulary: "Vocabulary",
  flashcards: "Flashcards",
  quiz: "Quiz",
  reflection: "Reflect",
  complete: "Complete",
};

const PODCAST_FLOW: SessionStep[] = ["player", "summary", "vocabulary", "flashcards", "quiz", "reflection", "complete"];
const ARTICLE_FLOW: SessionStep[] = [
  "reading",
  "dictionary",
  "summary",
  "vocabulary",
  "flashcards",
  "quiz",
  "reflection",
  "complete",
];

/**
 * The ordered step sequence for a content type — the one place the state
 * machine (LearningSessionView) and its stepper (SessionStepper) look to
 * know where a session starts and what comes after its "intake" step(s).
 * Everything from "summary" onward is identical across content types; only
 * how a learner first consumes the content (listening vs. reading + looking
 * up words) differs.
 */
export function getSessionFlow(contentType: ContentItem["contentType"]): SessionStep[] {
  return contentType === "article" ? ARTICLE_FLOW : PODCAST_FLOW;
}
