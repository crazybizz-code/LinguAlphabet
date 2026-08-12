import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

/**
 * No new schema/table (per this task's explicit instruction — reuse the
 * existing podcast schema, don't invent a parallel one). Idempotency is
 * achieved the same way podcastContentId() already works: a deterministic
 * content_items.id derived from a stable externalId, checked BEFORE any
 * expensive work (Fish Audio call, alignment, enrichment) runs.
 *
 * A run that fails partway through never reaches upsertContentItem/
 * publishContentItem (same posture as ingestPodcastEpisode and the
 * article pipeline: nothing is persisted until the quality gate passes),
 * so content_items simply has no row for this id yet — retrying is just
 * running again. The one exception is the Storage upload, which uses
 * upsert:true at a deterministic path (storage.ts) for the same reason:
 * a retry overwrites rather than orphaning a second file.
 */

export function podcastContentId(externalId: string): string {
  return `podcast-${createHash("sha256").update(externalId).digest("hex").slice(0, 16)}`;
}

export interface ExistingEpisodeCheck {
  exists: boolean;
  published: boolean;
  contentItemId: string;
}

export async function checkExistingEpisode(supabase: SupabaseClient, externalId: string): Promise<ExistingEpisodeCheck> {
  const contentItemId = podcastContentId(externalId);
  const { data } = await supabase.from("content_items").select("id, status").eq("id", contentItemId).maybeSingle();

  return {
    exists: Boolean(data),
    published: data?.status === "published",
    contentItemId,
  };
}

/**
 * Derives the next episode number from the DB rather than assuming.
 *
 * CRITICAL: `content_items.id` starting with "podcast-" is NOT a reliable
 * marker of a LinguABC-original episode — the existing, already-running
 * `/api/content-engine/ingest` cron uses the exact same podcastContentId()
 * hash scheme for VOA/NOAA-sourced episodes (confirmed live: 30 VOA + 2
 * NOAA rows share this prefix alongside Episode #001). The only reliable
 * marker is `podcast_details.attribution = 'LinguABC'`, set exclusively by
 * this pipeline (see the EpisodeInput this module's caller builds).
 * Counting by id prefix alone would have produced episode number ~34
 * instead of 2 — caught by inspection before this was ever run.
 */
/**
 * MAX-based, not COUNT-based. A plain `count + 1` breaks the moment any
 * episode is ever deleted: after Episode #003 was deleted (its row AND
 * storage object both fully removed, per an explicit cleanup task), a
 * count of the 2 remaining LinguABC rows would recompute "3" again --
 * silently reusing the exact externalId/content_items.id/storage path
 * the deleted episode used for whatever new content comes next, and
 * every subsequent run would keep recomputing that same stale number
 * forever (since the count never advances past however many rows
 * currently exist). Parsing the real episode number out of each row's
 * audio_url (storage.ts's `episode-{NNN}/podcast.mp3` convention) and
 * taking the max instead means the numbering always continues forward
 * from whatever has actually been published, gaps included.
 */
export async function nextEpisodeNumber(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("podcast_details").select("audio_url").eq("attribution", "LinguABC");
  if (error) throw new Error(`Idempotency: failed to read existing LinguABC episodes: ${error.message}`);
  if (!data || data.length === 0) return 1;

  let maxEpisodeNumber = 0;
  for (const row of data) {
    const match = /episode-(\d+)\/podcast\.mp3/.exec(row.audio_url ?? "");
    if (match) maxEpisodeNumber = Math.max(maxEpisodeNumber, parseInt(match[1], 10));
  }
  // Defensive fallback, never expected to trigger given every LinguABC
  // episode is uploaded via uploadEpisodeAudio()'s fixed path convention:
  // if somehow no row's audio_url matched, fall back to count + 1 rather
  // than silently returning 1 and colliding with real existing rows.
  return maxEpisodeNumber > 0 ? maxEpisodeNumber + 1 : data.length + 1;
}

/**
 * Defense-in-depth, called by pipeline.ts immediately before the storage
 * upload -- NEVER trust a caller-supplied episodeNumber just because it
 * was accepted earlier in the call chain. Security-audit finding: with
 * uploadEpisodeAudio()'s upsert:true, an unverified episodeNumber can
 * silently overwrite an existing published episode's audio file (e.g.
 * episode-001/podcast.mp3) while creating an unrelated new content_items
 * row -- a real, live overwrite vector, not theoretical.
 *
 * Passes if EITHER:
 *   (a) episodeNumber equals the current live nextEpisodeNumber() -- the
 *       normal case for every automated run, or
 *   (b) the storage slot is independently PROVEN unoccupied right now (no
 *       LinguABC podcast_details row references that exact path) -- the
 *       narrow, deliberate exception for a human-supervised gap-recovery
 *       (e.g. regenerating a permanently-deleted episode's freed number),
 *       which must still be verified fresh here, never just asserted by
 *       the caller.
 * Throws otherwise -- the caller must treat that as a failed generation,
 * never proceed to upload.
 */
export interface OrphanedDraftCheck {
  orphaned: boolean;
  contentItemId?: string;
  episodeNumber?: number;
}

/**
 * Security-audit finding (MEDIUM): a hard crash between the
 * podcast_details write and publishContentItem() (job timeout, OOM, the
 * 15-minute whisper SIGKILL boundary) leaves a permanently orphaned
 * `draft` content_items row plus an orphaned storage object -- neither
 * M1's cleanup (only runs on a caught, in-process `rejected` outcome, not
 * a hard crash) nor C1's draft-first write (prevents an inconsistent
 * PUBLISHED row, not an indefinite draft) catches this. Left unchecked,
 * nextEpisodeNumber() silently advances past the stuck draft on every
 * subsequent run -- an ever-growing, invisible trail of orphaned
 * draft rows and storage objects, never resumed, never surfaced.
 *
 * This is intentionally NOT a cleanup mechanism -- deleting a draft row
 * or storage object automatically risks destroying a row that is mid-write
 * for a legitimate, still-running concurrent generation, or one an
 * operator is actively reviewing. Instead: detect the orphan and refuse
 * to silently step past it. The caller must treat a positive result as a
 * failed generation requiring manual review (read the row, confirm it's
 * genuinely abandoned, decide whether to delete it and its storage
 * object or resume it) -- never as something to route around.
 *
 * Every LinguABC podcast_details row has a matching content_items row
 * (upsertContentItem always runs first, per C1) -- so any LinguABC
 * podcast_details row whose content_items.status is NOT "published" is,
 * by construction, a draft that never completed.
 */
export async function checkForOrphanedDraft(supabase: SupabaseClient): Promise<OrphanedDraftCheck> {
  const { data: detailsRows, error: detailsError } = await supabase
    .from("podcast_details")
    .select("content_item_id, audio_url")
    .eq("attribution", "LinguABC");
  if (detailsError) throw new Error(`Idempotency: failed to check for orphaned drafts: ${detailsError.message}`);
  if (!detailsRows || detailsRows.length === 0) return { orphaned: false };

  const ids = detailsRows.map((row) => row.content_item_id);
  const { data: itemRows, error: itemsError } = await supabase.from("content_items").select("id, status").in("id", ids);
  if (itemsError) throw new Error(`Idempotency: failed to check for orphaned drafts: ${itemsError.message}`);

  const draftRow = (itemRows ?? []).find((row) => row.status !== "published");
  if (!draftRow) return { orphaned: false };

  const detailsRow = detailsRows.find((row) => row.content_item_id === draftRow.id);
  const match = /episode-(\d+)\/podcast\.mp3/.exec(detailsRow?.audio_url ?? "");
  return {
    orphaned: true,
    contentItemId: draftRow.id,
    episodeNumber: match ? parseInt(match[1], 10) : undefined,
  };
}

export async function assertEpisodeNumberSafe(supabase: SupabaseClient, episodeNumber: number): Promise<void> {
  const currentNext = await nextEpisodeNumber(supabase);
  if (episodeNumber === currentNext) return;

  const path = `episode-${String(episodeNumber).padStart(3, "0")}/podcast.mp3`;
  const { data, error } = await supabase.from("podcast_details").select("audio_url").eq("attribution", "LinguABC");
  if (error) throw new Error(`Idempotency: failed to verify episode number ${episodeNumber} is safe: ${error.message}`);

  const occupied = (data ?? []).some((row) => (row.audio_url ?? "").includes(path));
  if (occupied) {
    throw new Error(
      `Refusing to use episode number ${episodeNumber}: an existing published LinguABC episode already occupies ${path}. This would overwrite it.`,
    );
  }
}
