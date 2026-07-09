/**
 * Rich domain types for the universal content system
 * (docs/domain-model.md §6/§7, supabase/content-schema.sql). The
 * Supabase row types in src/types/supabase.ts store the enrichment
 * fields (vocabulary/quiz/takeaways/transcript) as generic Json —
 * these narrower types are what application code actually works with
 * once that Json is parsed.
 */

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface TranscriptSegment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
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
