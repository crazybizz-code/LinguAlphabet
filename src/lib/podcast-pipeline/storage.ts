import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "./config";

/**
 * LinguABC's own Supabase Storage bucket for original (not syndicated)
 * podcast audio — created for Episode #001, reused here rather than
 * re-created per episode. Path convention: `episode-{NNN}/podcast.mp3`,
 * matching Episode #001's `episode-001/podcast.mp3` exactly.
 */

export async function ensureBucketExists(supabase: SupabaseClient): Promise<void> {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Storage: failed to list buckets: ${error.message}`);
  if (buckets.some((b) => b.name === STORAGE_BUCKET)) return;

  const { error: createError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: "20MB",
    allowedMimeTypes: ["audio/mpeg"],
  });
  if (createError) throw new Error(`Storage: failed to create bucket ${STORAGE_BUCKET}: ${createError.message}`);
}

export function episodeAudioPath(episodeNumber: number): string {
  return `episode-${String(episodeNumber).padStart(3, "0")}/podcast.mp3`;
}

/** `upsert: true` — a retried run overwrites the same path rather than
 * accumulating orphaned uploads, which is what makes a failed run safe
 * to simply re-run (see idempotency.ts). */
export async function uploadEpisodeAudio(supabase: SupabaseClient, episodeNumber: number, audio: Buffer): Promise<string> {
  await ensureBucketExists(supabase);
  const path = episodeAudioPath(episodeNumber);

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, audio, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  if (error) throw new Error(`Storage: failed to upload ${path}: ${error.message}`);

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Cleanup for a run that uploaded audio but failed a LATER stage (quality
 * gate, DB write) -- called by pipeline.ts with the exact episodeNumber
 * that run itself just used, never a caller-supplied path, so this can
 * never touch another episode's object. Always derives the path from
 * episodeAudioPath() rather than accepting one directly, for the same
 * reason. Throws on failure -- the caller logs it as an error but must
 * still return the ORIGINAL pipeline failure, not this one.
 */
export async function deleteEpisodeAudio(supabase: SupabaseClient, episodeNumber: number): Promise<void> {
  const path = episodeAudioPath(episodeNumber);
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) throw new Error(`Storage: failed to clean up orphaned ${path}: ${error.message}`);
}
