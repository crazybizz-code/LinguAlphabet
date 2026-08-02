import { createHash } from "node:crypto";
import type { TranscriptSegment } from "@/types/content";

/**
 * Content-identity hash for a podcast episode.
 *
 * `podcastContentId()` hashes the audio URL, which makes re-submitting
 * the *same URL* idempotent — but that is the only dedup podcasts have,
 * and it does nothing about the case that actually happens: the same
 * episode offered under two URLs (a CDN change, an http/https variant, a
 * `?utm_source=` suffix, a publisher re-host). Both would publish, and
 * a learner would meet the same lesson twice.
 *
 * Hashing the transcript instead identifies the episode by what it
 * *says*, which is the thing that doesn't change when a URL does. This
 * mirrors the pipeline's existing `computeContentHash(raw.body)` for
 * articles — same idea, same purpose, applied to the audio equivalent of
 * a body.
 */

/**
 * Normalization is what makes the hash stable across the differences we
 * do NOT want to be significant:
 *   - speaker labels (one publisher writes "Host:", another "ANNA:")
 *   - casing and punctuation drift between a publisher transcript and an
 *     operator-typed one
 *   - whitespace and line-break differences
 *
 * What survives normalization is the word sequence, which is the episode.
 */
export function normalizeTranscriptForHash(segments: TranscriptSegment[]): string {
  return segments
    .map((segment) => segment.text)
    .join(" ")
    .toLowerCase()
    // Apostrophes are DELETED, not spaced, so "don't" collapses to "dont"
    // rather than "don t" — otherwise a publisher using a typographic
    // apostrophe and an operator using a straight one produce two
    // different hashes for one episode, which is the exact drift this
    // normalization exists to remove.
    .replace(/['’`]/g, "")
    // Everything else non-alphanumeric becomes a space, so an em dash
    // between two words doesn't fuse them into one token.
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Null for an empty transcript — an empty hash would collide every transcript-less episode with every other, which is worse than not deduping. */
export function computeTranscriptHash(segments: TranscriptSegment[]): string | null {
  const normalized = normalizeTranscriptForHash(segments);
  if (normalized.length === 0) return null;
  return createHash("sha256").update(normalized).digest("hex");
}
