import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ContentItemDraft } from "./types";

type Client = SupabaseClient<Database>;
type ContentItemsInsert = Database["public"]["Tables"]["content_items"]["Insert"];

/**
 * 4. Storage — generalizes what scripts/build-podcast-seed.mjs currently
 * hand-writes as bespoke SQL per field. Two functions, neither aware of
 * any specific content type: the pipeline (pipeline.ts) is what decides
 * which `*_details` table a draft's `detailsRow` belongs to
 * (ContentItemDraft.detailsTable), this file just writes it. Uses the
 * service-role client (lib/supabase/service-client.ts) — ingestion has
 * no user session to write under.
 */

// TEMPORARY diagnostic instrumentation for the thumbnail_url=NULL
// production blocker -- gated by title so it stays silent for every other
// article. Remove once the root cause is fixed.
function isThumbnailTraceTarget(title: string): boolean {
  return title.includes("SAVE America Act");
}

function toContentItemsRow(draft: ContentItemDraft, status: "draft" | "published"): ContentItemsInsert {
  const row: ContentItemsInsert = {
    id: draft.id,
    content_type: draft.contentType,
    title: draft.title,
    description: draft.description,
    cefr_level_min: draft.cefrLevelMin,
    cefr_level_max: draft.cefrLevelMax,
    topics: draft.topics,
    skills: draft.skills,
    goal_alignment: draft.goalAlignment,
    tags: draft.tags,
    estimated_time_minutes: draft.estimatedTimeMinutes,
    thumbnail_url: draft.thumbnailUrl,
    status,
    published_at: draft.publishedAt,
  };
  if (isThumbnailTraceTarget(draft.title)) {
    console.log(
      `[thumbnail-trace] STAGE 7 content_items.thumbnail_url before persistence (id=${draft.id}): ${JSON.stringify(row.thumbnail_url)}`,
    );
  }
  return row;
}

export async function upsertContentItem(
  supabase: Client,
  draft: ContentItemDraft,
  status: "draft" | "published",
): Promise<void> {
  const trace = isThumbnailTraceTarget(draft.title);
  // .select().single() is added here purely so stage 8 can print exactly
  // what Postgres persisted -- the upsert itself is unchanged.
  const query = supabase.from("content_items").upsert(toContentItemsRow(draft, status), { onConflict: "id" });
  if (trace) {
    const { data, error } = await query.select().single();
    if (error) throw new Error(`Storage: failed to upsert content_items row ${draft.id}: ${error.message}`);
    console.log(`[thumbnail-trace] STAGE 8 row returned after upsert (id=${draft.id}): thumbnail_url=${JSON.stringify(data?.thumbnail_url)}`);
    return;
  }
  const { error } = await query;
  if (error) throw new Error(`Storage: failed to upsert content_items row ${draft.id}: ${error.message}`);
}

/**
 * `table` is intentionally a plain string, not a keyof Database["public"]["Tables"]
 * — the hand-written Database type only knows about podcast_details today,
 * and this function must keep working unmodified once article_details/
 * video_details/etc. exist (they'll be added to src/types/supabase.ts when
 * each type's provider ships, per docs/content-engine.md's checklist).
 */
export async function upsertContentDetails(
  supabase: Client,
  table: string,
  row: Record<string, unknown> & { content_item_id: string },
): Promise<void> {
  // A deliberate, narrow escape hatch: `.from()` is normally typed against
  // the known table names in Database["public"]["Tables"], but this
  // function's whole job is to accept a details table the hand-written
  // types don't know about yet. Scoped to this one call (the `as
  // SupabaseClient` widening below), not a broad type-safety compromise.
  const untyped = supabase as unknown as SupabaseClient;
  const { error } = await untyped.from(table).upsert(row, { onConflict: "content_item_id" });
  if (error) throw new Error(`Storage: failed to upsert ${table} row for ${row.content_item_id}: ${error.message}`);
}
