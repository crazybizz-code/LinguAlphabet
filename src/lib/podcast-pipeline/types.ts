import type { EnrichmentResult } from "@/lib/content-engine/types";
import type { SpeakerName } from "./config";

/** One line of dialogue. `text` may contain bracket prosody directions
 * (e.g. "[emphasis] really strange") — these ARE sent to Fish Audio for
 * synthesis but are stripped before being stored as the reader-facing
 * transcript (see transcript.ts). */
export type ScriptLine = [speaker: SpeakerName, text: string];

/** Everything a human operator (today) or a future script-generation step
 * hands the pipeline for one episode. Deliberately does not include
 * audio/transcript/timing — those are produced BY the pipeline, not
 * supplied to it. */
export interface EpisodeInput {
  /** Stable id, e.g. "linguabc-episode-002" — the pipeline's idempotency key. */
  externalId: string;
  episodeNumber: number;
  title: string;
  topic: string;
  script: ScriptLine[];
  /** Hand-authored today (no GEMINI_API_KEY configured; see podcast-pipeline docs). Validated against the real Zod schema before use — never a parallel schema. */
  enrichment: EnrichmentResult;
  /**
   * Bypasses the Fish Audio synthesis call entirely and uses these exact
   * bytes as the episode's audio instead — for the case where audio was
   * already generated and manually approved out-of-band (e.g.
   * podcast-test/<episode>/podcast.mp3) and must be published byte-for-byte
   * unchanged, never regenerated. Every other stage (duration validation,
   * alignment, enrichment validation, upload, quality gate, publish,
   * verification) runs exactly as it does for freshly synthesized audio —
   * this only skips the one network call to Fish Audio. Absent for every
   * caller that wants normal synthesis, so existing behaviour is unchanged
   * when this is omitted.
   */
  precomputedAudio?: Buffer;
}

export type PipelineStage =
  | "STARTED"
  | "IDEMPOTENCY_CHECKED"
  | "AUDIO_GENERATED"
  | "AUDIO_VALIDATED"
  | "TRANSCRIPT_ALIGNED"
  | "ENRICHMENT_VALIDATED"
  | "QUALITY_GATE_PASSED"
  | "AUDIO_UPLOADED"
  | "AUDIO_CLEANED_UP"
  | "DB_CREATED"
  | "PUBLISHED"
  | "VERIFIED";

export interface PipelineLogEntry {
  generationId: string;
  stage: PipelineStage | `FAILED:${PipelineStage}`;
  at: string;
  meta?: Record<string, unknown>;
}

export type PipelineOutcome =
  | { status: "already_published"; contentItemId: string; generationId: string }
  | { status: "published"; contentItemId: string; generationId: string; log: PipelineLogEntry[] }
  | { status: "failed"; stage: PipelineStage; reason: string; generationId: string; log: PipelineLogEntry[] };
