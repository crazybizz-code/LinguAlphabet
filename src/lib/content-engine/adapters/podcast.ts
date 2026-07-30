import { createHash } from "node:crypto";
import type { TranscriptSegment } from "@/types/content";
import type { ProviderDraft } from "../types";

/**
 * Podcast Adapter — mirrors the Article Adapter exactly, differing only
 * in which *_details table it targets and which type-specific columns it
 * fills. Everything universal (title/description/tags/thumbnail) and
 * everything AI-derived (CEFR, topics, summary, vocabulary, quiz, key
 * expressions, listening notes) is handled identically by the shared
 * pipeline, which is the whole point of the adapter split.
 */

export interface PodcastEpisodeInput {
  /** Stable identifier for this episode — the audio URL by default, so re-submitting the same episode upserts rather than duplicating. */
  externalId?: string;
  title: string;
  description?: string;
  audioUrl: string;
  /** Required by podcast_details.duration_seconds (NOT NULL) and by the transcript-length verification check. */
  durationSeconds: number;
  publishedAt?: string;
  thumbnailUrl?: string;
}

export function podcastContentId(externalId: string): string {
  return `podcast-${createHash("sha256").update(externalId).digest("hex").slice(0, 16)}`;
}

/**
 * `transcript` is the VERIFIED transcript's segments — this adapter is
 * only ever reached after verifyTranscript() returned "accept", so it
 * never has to decide whether the transcript is trustworthy.
 */
export function toPodcastDraft(input: PodcastEpisodeInput, transcript: TranscriptSegment[]): ProviderDraft {
  const externalId = input.externalId ?? input.audioUrl;

  return {
    id: podcastContentId(externalId),
    contentType: "podcast",
    title: input.title,
    description: input.description?.trim() ?? "",
    skills: ["Listening"],
    goalAlignment: [],
    tags: [],
    thumbnailUrl: input.thumbnailUrl ?? "",
    publishedAt: input.publishedAt,
    detailsTable: "podcast_details",
    detailsRow: {
      audio_url: input.audioUrl,
      duration_seconds: Math.round(input.durationSeconds),
      // Stored in the exact shape podcast_details.transcript already uses
      // and the Learning Session's PlayerStep already renders — snake_case
      // keys, so no translation layer is needed at read time.
      transcript: transcript.map((segment) => ({
        speaker: segment.speaker,
        text: segment.text,
        start_ms: segment.startMs ?? 0,
        end_ms: segment.endMs ?? 0,
      })),
    },
  };
}
