import type { CefrLevel, ContentItem, QuizQuestion, VocabularyEntry } from "@/types/content";

/**
 * The shared vocabulary for every subsystem in the Content Engine
 * (docs/content-engine.md). Nothing here is content-type-specific — a
 * type-specific concern (an RSS item's <guid>, an article's body HTML)
 * lives inside `rawPayload`/`detailsRow`, which the engine treats as an
 * opaque blob it never inspects, only stores and hands to AI Processing.
 */

/** content_type is the discriminator content_items already uses — reused,
 * not redefined, so the engine can never drift from the real schema enum. */
export type ContentType = ContentItem["contentType"];

/**
 * 1. Content Providers — the only interface a new source (RSS, a video
 * API, a news API, ...) has to implement. `sourceConfig` is whatever that
 * source needs (a feed URL, an API key reference, ...) — provider-defined,
 * stored as `content_sources.config` jsonb, never interpreted by the
 * pipeline itself.
 */
export interface RawContentItem {
  /** The source's own stable identifier (an RSS <guid>, an API item id, ...) — the dedup key. */
  externalId: string;
  title: string;
  /** Raw source text/HTML — what AI Processing enriches from. Never rendered directly. */
  body: string;
  url?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  /** The complete original source record (an RSS item, an API payload) — preserved as-is for content_raw_items.raw_payload, never interpreted by the pipeline. */
  raw?: unknown;
}

export interface ContentProvider {
  /** Stable id, e.g. "rss" — matches content_sources.provider_id. */
  id: string;
  contentType: ContentType;
  fetchRawItems(sourceConfig: Record<string, unknown>): Promise<RawContentItem[]>;
}

/**
 * 3. AI Processing's output — the universal enrichment attachments
 * (docs/domain-model.md's Podcast Model section: "Vocabulary, Key
 * Expressions, Quiz, Reflection, and Resources are universal enrichment
 * attachments that Article, Story, Video, News, Conversation, and
 * Challenge should all be able to carry the same way"). One shape,
 * reused by every content type's *_details table — never redefined per
 * type. Reuses VocabularyEntry/QuizQuestion as-is rather than inventing a
 * parallel shape.
 */
export interface EnrichmentResult {
  cefrLevelMin: CefrLevel;
  cefrLevelMax: CefrLevel;
  /** Filtered to the controlled vocabulary (src/lib/constants/topics.ts) — never a hallucinated value. */
  topics: string[];
  summary: string;
  vocabulary: VocabularyEntry[];
  quiz: QuizQuestion[];
  takeaways: string[];
  reflection: string;
}

/**
 * A normalized, not-yet-persisted content item — universal fields only
 * (in the same camelCase shape as ContentItem, so storage.ts is the one
 * place that translates to the snake_case DB row). Type-specific fields
 * (audioUrl, body, ...) live in `detailsRow`, an opaque record keyed by
 * whatever columns that content type's `*_details` table expects —
 * upsertContentDetails() writes it as-is, never inspects its shape.
 */
export interface ContentItemDraft {
  id: string;
  contentType: ContentType;
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
  publishedAt?: string;
  detailsTable: string;
  detailsRow: Record<string, unknown>;
}

/**
 * What a provider's `normalize()` can honestly know before AI Processing has
 * run — cefrLevelMin/Max, topics, and estimatedTimeMinutes are all derived
 * from enrichment (docs/content-engine.md), so a provider never fabricates
 * placeholder values for them. The pipeline fills these in after
 * generateEnrichment() resolves.
 */
export type ProviderDraft = Omit<ContentItemDraft, "cefrLevelMin" | "cefrLevelMax" | "topics" | "estimatedTimeMinutes">;

/** 5. Publishing's quality gate result (docs/content-lifecycle.md §1 stage 3). */
export interface QualityGateResult {
  passed: boolean;
  reasons: string[];
}

/** 2. Pipeline's per-run summary — mirrors content_ingestion_runs' columns. */
export interface IngestionRunResult {
  runId: string;
  itemsFetched: number;
  itemsPublished: number;
  itemsRejected: number;
  status: "completed" | "failed";
  error?: string;
}
