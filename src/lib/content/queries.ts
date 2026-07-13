import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ArticleContent, CefrLevel, PodcastContent } from "@/types/content";

type Client = SupabaseClient<Database>;
type ContentItemRow = Database["public"]["Tables"]["content_items"]["Row"];
type PodcastDetailsRow = Database["public"]["Tables"]["podcast_details"]["Row"];
type ArticleDetailsRow = Database["public"]["Tables"]["article_details"]["Row"];

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
    thumbnailUrl: item.thumbnail_url ?? "",
    status: item.status,
    featured: item.featured,
    premium: item.premium,
    publishedAt: item.published_at ?? item.created_at,
    audioUrl: details.audio_url,
    durationSeconds: details.duration_seconds,
    transcript: (details.transcript ?? []) as unknown as PodcastContent["transcript"],
    summary: details.summary ?? "",
    takeaways: (details.takeaways ?? []) as unknown as string[],
    vocabulary: (details.vocabulary ?? []) as unknown as PodcastContent["vocabulary"],
    quiz: (details.quiz ?? []) as unknown as PodcastContent["quiz"],
    reflection: details.reflection ?? "",
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

/** A single published podcast by id — Podcast Detail/Player/Learning Session all need this. */
export async function getPodcastById(supabase: Client, id: string): Promise<PodcastContent | null> {
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
    supabase.from("content_items").select("*").eq("id", id).eq("content_type", "article").maybeSingle(),
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
