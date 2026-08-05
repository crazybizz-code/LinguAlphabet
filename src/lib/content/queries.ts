import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ArticleContent, CefrLevel, KeyExpression, PodcastContent, TranscriptSegment, TranscriptWord } from "@/types/content";

type Client = SupabaseClient<Database>;
type ContentItemRow = Database["public"]["Tables"]["content_items"]["Row"];
type PodcastDetailsRow = Database["public"]["Tables"]["podcast_details"]["Row"];
type ArticleDetailsRow = Database["public"]["Tables"]["article_details"]["Row"];

/**
 * Normalizes a raw transcript from DB into typed TranscriptSegment[].
 * Handles both camelCase keys (BBC seed data) and snake_case keys (VOA
 * pipeline adapter) that may coexist in the same table. The fix belongs
 * here at read time so no production data needs migration and future
 * writers can use either convention without breaking playback.
 */
export function normalizeTranscript(raw: unknown): TranscriptSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((seg: Record<string, unknown>) => ({
    speaker: String(seg.speaker ?? ""),
    text: String(seg.text ?? ""),
    startMs: Number(seg.startMs ?? seg.start_ms ?? 0),
    endMs: Number(seg.endMs ?? seg.end_ms ?? 0),
    ...(Array.isArray(seg.words) && seg.words.length > 0
      ? {
          words: (seg.words as Record<string, unknown>[]).map((w) => ({
            word: String(w.word ?? ""),
            startMs: Number(w.startMs ?? w.start_ms ?? 0),
            endMs: Number(w.endMs ?? w.end_ms ?? 0),
          })) satisfies TranscriptWord[],
        }
      : {}),
  }));
}

function toPodcastContent(item: ContentItemRow, details: PodcastDetailsRow): PodcastContent {
  return {
    id: item.id,
    contentType: "podcast",
    title: item.title,
    description: item.description ?? "",
    cefrLevelMin: item.cefr_level_min as CefrLevel,
    cefrLevelMax: item.cefr_level_max as CefrLevel,
    topics: item.topics,
    skills: item.skills,
    goalAlignment: item.goal_alignment,
    tags: item.tags,
    estimatedTimeMinutes: item.estimated_time_minutes,
    // A missing/empty thumbnail_url is passed through as-is — PodcastCard
    // renders the branded cover (BrandedCoverFallback) for any value that
    // isn't a real, allowlisted-host URL, so there's nothing to resolve
    // here.
    thumbnailUrl: item.thumbnail_url ?? "",
    status: item.status,
    featured: item.featured,
    premium: item.premium,
    publishedAt: item.published_at ?? item.created_at,
    audioUrl: details.audio_url,
    durationSeconds: details.duration_seconds,
    transcript: normalizeTranscript(details.transcript),
    summary: details.summary ?? "",
    takeaways: (details.takeaways ?? []) as unknown as string[],
    vocabulary: (details.vocabulary ?? []) as unknown as PodcastContent["vocabulary"],
    quiz: (details.quiz ?? []) as unknown as PodcastContent["quiz"],
    reflection: details.reflection ?? "",
    keyExpressions: (details.key_expressions ?? []) as unknown as KeyExpression[],
    listeningNotes: (details.listening_notes ?? []) as unknown as string[],
    discussionQuestions: (details.discussion_questions ?? []) as unknown as string[],
  };
}

/**
 * All published podcasts, joined from content_items + podcast_details.
 * Two plain queries + an in-memory merge rather than a PostgREST embedded
 * select (`select("*, podcast_details(*)")`) — src/types/supabase.ts is
 * hand-written with empty `Relationships`, so an embedded select wouldn't
 * type-check against it. Fine at this catalog size (13 podcasts today,
 * see docs/content-lifecycle.md for the pagination story once that grows).
 */
export async function getPublishedPodcasts(supabase: Client): Promise<PodcastContent[]> {
  const { data: items } = await supabase
    .from("content_items")
    .select("*")
    .eq("content_type", "podcast")
    .eq("status", "published")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false });

  if (!items || items.length === 0) return [];

  const { data: details } = await supabase
    .from("podcast_details")
    .select("*")
    .in(
      "content_item_id",
      items.map((item) => item.id),
    );

  const detailsById = new Map((details ?? []).map((detail) => [detail.content_item_id, detail]));

  return items
    .map((item) => {
      const detail = detailsById.get(item.id);
      return detail ? toPodcastContent(item, detail) : null;
    })
    .filter((item): item is PodcastContent => item !== null);
}

/**
 * Catalog-only podcast fetch — omits transcript and all enrichment fields
 * (vocabulary, quiz, reflection, key_expressions, …) that are only needed
 * in the Learning Session. Calling this instead of getPublishedPodcasts for
 * card/feed views saves tens of KB of JSON per request.
 *
 * Missing detail fields fall back to their zero values inside toPodcastContent
 * (empty arrays / empty strings via nullish coalescing) — cards never read them.
 * The cast is deliberate: we intentionally omit columns the mapper handles safely.
 */
async function fetchPublishedPodcastSummaries(supabase: Client): Promise<PodcastContent[]> {
  const { data: items } = await supabase
    .from("content_items")
    .select("*")
    .eq("content_type", "podcast")
    .eq("status", "published")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false });

  if (!items || items.length === 0) return [];

  const { data: details } = await supabase
    .from("podcast_details")
    .select("content_item_id, audio_url, duration_seconds")
    .in("content_item_id", items.map((item) => item.id));

  const detailsById = new Map((details ?? []).map((d) => [d.content_item_id, d]));

  return items
    .map((item) => {
      const detail = detailsById.get(item.id);
      if (!detail) return null;
      return toPodcastContent(item, detail as unknown as PodcastDetailsRow);
    })
    .filter((item): item is PodcastContent => item !== null);
}

/**
 * Catalog-only article fetch — omits body text and enrichment fields. Mirrors
 * fetchPublishedPodcastSummaries: cards show title/description/thumbnail only.
 */
async function fetchPublishedArticleSummaries(supabase: Client): Promise<ArticleContent[]> {
  const { data: items } = await supabase
    .from("content_items")
    .select("*")
    .eq("content_type", "article")
    .eq("status", "published")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false });

  if (!items || items.length === 0) return [];

  const { data: details } = await supabase
    .from("article_details")
    .select("content_item_id, source_url, author, reading_time_minutes")
    .in("content_item_id", items.map((item) => item.id));

  const detailsById = new Map((details ?? []).map((d) => [d.content_item_id, d]));

  return items
    .map((item) => {
      const detail = detailsById.get(item.id);
      if (!detail) return null;
      return toArticleContent(item, detail as unknown as ArticleDetailsRow);
    })
    .filter((item): item is ArticleContent => item !== null);
}

/**
 * Per-request cached podcast catalog — deduplicates the fetch when layout
 * (sidebar stats) and the page itself both need the catalog on the same
 * request. Uses lean SELECT (no transcript/enrichment). Learn pages use
 * getPodcastById instead.
 */
export const getCachedPublishedPodcasts = cache(fetchPublishedPodcastSummaries);

/**
 * Per-request cached article catalog. Same pattern as getCachedPublishedPodcasts.
 */
export const getCachedPublishedArticles = cache(fetchPublishedArticleSummaries);

/** A single published podcast by id — Podcast Detail/Player/Learning Session all need this. */
export async function getPodcastById(supabase: Client, id: string): Promise<PodcastContent | null> {
  const [{ data: item }, { data: details }] = await Promise.all([
    supabase.from("content_items").select("*").eq("id", id).eq("content_type", "podcast").eq("status", "published").maybeSingle(),
    supabase.from("podcast_details").select("*").eq("content_item_id", id).maybeSingle(),
  ]);

  if (!item || !details) return null;
  return toPodcastContent(item, details);
}

/**
 * Draft-or-published podcast fetch for operator preview — call ONLY with a
 * service-role client that bypasses RLS. The anon/session client will always
 * return null for draft rows, which is the correct behaviour for learner routes.
 * Never call this from a client component or from any learner-facing code path.
 */
export async function getDraftPodcastByIdForPreview(supabase: Client, id: string): Promise<PodcastContent | null> {
  const [{ data: item }, { data: details }] = await Promise.all([
    supabase.from("content_items").select("*").eq("id", id).eq("content_type", "podcast").maybeSingle(),
    supabase.from("podcast_details").select("*").eq("content_item_id", id).maybeSingle(),
  ]);

  if (!item || !details) return null;
  return toPodcastContent(item, details);
}

function toArticleContent(item: ContentItemRow, details: ArticleDetailsRow): ArticleContent {
  return {
    id: item.id,
    contentType: "article",
    title: item.title,
    description: item.description ?? "",
    cefrLevelMin: item.cefr_level_min as CefrLevel,
    cefrLevelMax: item.cefr_level_max as CefrLevel,
    topics: item.topics,
    skills: item.skills,
    goalAlignment: item.goal_alignment,
    tags: item.tags,
    estimatedTimeMinutes: item.estimated_time_minutes,
    // A missing/empty thumbnail_url is passed through as-is — ArticleCard
    // renders the branded cover (BrandedCoverFallback) for any value that
    // isn't a real, allowlisted-host URL, so there's nothing to resolve
    // here.
    thumbnailUrl: item.thumbnail_url ?? "",
    status: item.status,
    featured: item.featured,
    premium: item.premium,
    publishedAt: item.published_at ?? item.created_at,
    body: details.body,
    sourceUrl: details.source_url ?? "",
    author: details.author ?? "",
    readingTimeMinutes: details.reading_time_minutes,
    summary: details.summary ?? "",
    takeaways: (details.takeaways ?? []) as unknown as string[],
    vocabulary: (details.vocabulary ?? []) as unknown as ArticleContent["vocabulary"],
    quiz: (details.quiz ?? []) as unknown as ArticleContent["quiz"],
    reflection: details.reflection ?? "",
  };
}

/** A single published article by id — the Article Learning Session needs this, mirrors getPodcastById exactly. */
export async function getArticleById(supabase: Client, id: string): Promise<ArticleContent | null> {
  const [{ data: item }, { data: details }] = await Promise.all([
    supabase.from("content_items").select("*").eq("id", id).eq("content_type", "article").eq("status", "published").maybeSingle(),
    supabase.from("article_details").select("*").eq("content_item_id", id).maybeSingle(),
  ]);

  if (!item || !details) return null;
  return toArticleContent(item, details);
}

/** All published articles, joined from content_items + article_details — mirrors getPublishedPodcasts exactly. */
export async function getPublishedArticles(supabase: Client): Promise<ArticleContent[]> {
  const { data: items } = await supabase
    .from("content_items")
    .select("*")
    .eq("content_type", "article")
    .eq("status", "published")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false });

  if (!items || items.length === 0) return [];

  const { data: details } = await supabase
    .from("article_details")
    .select("*")
    .in(
      "content_item_id",
      items.map((item) => item.id),
    );

  const detailsById = new Map((details ?? []).map((detail) => [detail.content_item_id, detail]));

  return items
    .map((item) => {
      const detail = detailsById.get(item.id);
      return detail ? toArticleContent(item, detail) : null;
    })
    .filter((item): item is ArticleContent => item !== null);
}
