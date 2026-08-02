/**
 * Rich domain types for the universal content system
 * (docs/domain-model.md §6/§7, supabase/content-schema.sql). The
 * Supabase row types in src/types/supabase.ts store the enrichment
 * fields (vocabulary/quiz/takeaways/transcript) as generic Json —
 * these narrower types are what application code actually works with
 * once that Json is parsed.
 */

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/**
 * One word with its own timing.
 *
 * Only ASR produces these — a publisher's HTML script has no timings at
 * all, which is the one respect in which machine transcription is better
 * raw material than a human one. Karaoke-style highlighting, click-a-word
 * -to-seek, and IELTS listening interactions that need "where in the
 * audio was this answer" all require word-level timing and cannot be
 * reconstructed later without re-transcribing.
 */
export interface TranscriptWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  /** Present for ASR transcripts, absent for publisher and operator ones. Nothing may depend on it existing. */
  words?: TranscriptWord[];
}

export interface VocabularyEntry {
  word: string;
  phonetic: string;
  pos: string;
  translation: string;
  definition: string;
  example: string;
}

export interface QuizQuestion {
  type: "mc" | "tf" | "fill";
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  /** Stable per-question identifier (Phase 5 — evidence traceability). Optional: quiz content ingested before this phase doesn't have one; QuizStep falls back to a contentId+index derivation for that case. */
  id?: string;
  /** Which grammar unit this question specifically tests, if any — set at ingestion (src/lib/content-engine/ai-processing.ts). Null/absent for a pure comprehension question. */
  grammarTopic?: string | null;
  /** Which vocabulary word this question specifically tests, if any. */
  vocabularyWord?: string | null;
}

/** The universal content_items row, narrowed to what the UI needs. */
export interface ContentItem {
  id: string;
  contentType: "podcast" | "article" | "story" | "video" | "news" | "conversation" | "challenge";
  title: string;
  description: string;
  cefrLevelMin: CefrLevel;
  cefrLevelMax: CefrLevel;
  topics: string[];
  skills: string[];
  goalAlignment: string[];
  tags: string[];
  estimatedTimeMinutes: number;
  thumbnailUrl: string;
  status: "draft" | "published" | "coming_soon";
  featured: boolean;
  premium: boolean;
  publishedAt: string;
}

/** content_items + podcast_details joined — what the player/learning session consume. */
export interface PodcastContent extends ContentItem {
  contentType: "podcast";
  audioUrl: string;
  durationSeconds: number;
  transcript: TranscriptSegment[];
  summary: string;
  takeaways: string[];
  vocabulary: VocabularyEntry[];
  quiz: QuizQuestion[];
  reflection: string;
}

/** content_items + article_details joined — mirrors PodcastContent exactly. */
export interface ArticleContent extends ContentItem {
  contentType: "article";
  body: string;
  sourceUrl: string;
  /** Original author byline, when the source provides one — some approved sources (docs/content-source-policy.md, e.g. Global Voices) require crediting it alongside sourceUrl. Empty when the source doesn't expose one. */
  author: string;
  readingTimeMinutes: number;
  summary: string;
  takeaways: string[];
  vocabulary: VocabularyEntry[];
  quiz: QuizQuestion[];
  reflection: string;
}
