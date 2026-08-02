import { createHash } from "node:crypto";
import type { TranscriptSegment } from "@/types/content";
import type { ProviderDraft } from "../types";
import { computeTranscriptHash } from "../transcripts/hash";

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
  /**
   * Provenance. Stored rather than inferred at read time: every one of
   * these is a fact about the moment we ingested, and a source's licence
   * can change afterwards without retroactively changing what we were
   * allowed to do with what we already have.
   */
  sourceUrl?: string;
  licence?: string;
  attribution?: string;
  transcriptProvenance?: "publisher" | "publisher_episode_page" | "operator" | "generated_asr";
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
      source_url: input.sourceUrl ?? "",
      licence: input.licence ?? "",
      attribution: input.attribution ?? "",
      transcript_provenance: input.transcriptProvenance ?? "operator",
      // Identifies the episode by what it SAYS, so the same episode under
      // a second audio URL is still recognisable as a duplicate. Null for
      // an empty transcript — the quality gate rejects those anyway, and a
      // hash of nothing would collide every empty episode with every other.
      transcript_hash: computeTranscriptHash(transcript),
      transcript: transcript.map((segment) => ({
        speaker: segment.speaker,
        text: segment.text,
        start_ms: segment.startMs ?? 0,
        end_ms: segment.endMs ?? 0,
        // Only ASR produces word timings, and they cannot be recovered
        // later without re-transcribing — so they are persisted when
        // present and the key is simply absent otherwise, leaving every
        // existing publisher/operator row's shape untouched.
        ...(segment.words && segment.words.length > 0
          ? {
              words: segment.words.map((word) => ({
                word: word.word,
                start_ms: word.startMs,
                end_ms: word.endMs,
              })),
            }
          : {}),
      })),
    },
  };
}
