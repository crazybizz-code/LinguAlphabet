import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { CefrLevel, PodcastContent } from "@/types/content";

type Client = SupabaseClient<Database>;
type ContentItemRow = Database["public"]["Tables"]["content_items"]["Row"];
type PodcastDetailsRow = Database["public"]["Tables"]["podcast_details"]["Row"];

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
