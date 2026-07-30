import type { TranscriptSegment } from "@/types/content";

/**
 * Transcript sourcing — the seam that keeps "where a transcript came from"
 * separate from "is this transcript trustworthy" and from "enrich it".
 *
 * Today the only implementation is ManualTranscriptSource (an operator
 * hands us a file). The explicit requirement is that an automatic
 * transcription service can replace it later WITHOUT touching the AI
 * processing pipeline — that works because nothing downstream of
 * TranscriptSource ever reads `sourceId` to decide behaviour: the
 * verifier scores a candidate on its own merits, and generateEnrichment()
 * only ever sees plain text. A WhisperTranscriptSource is a new file
 * implementing this interface plus one registration line, exactly like
 * ContentProvider (../types.ts) already works for content sources.
 */
export interface TranscriptCandidate {
  /** Provenance for the audit trail only — never branched on downstream. "manual" today; "whisper"/"deepgram"/… later. */
  sourceId: string;
  segments: TranscriptSegment[];
  /** Flattened plain text of every segment, in order — what verification scores and what AI enrichment consumes. */
  text: string;
}

/** Everything known about the episode independently of the transcript — the thing a transcript is checked AGAINST. */
export interface EpisodeMetadata {
  title: string;
  /** Show notes / episode description, when the operator supplies one — the only independent prose available to compare transcript content against. */
  description?: string;
  /** Stated runtime. Optional: without it the duration check can't run and says so rather than inventing a verdict. */
  durationSeconds?: number;
  audioUrl: string;
}

export interface TranscriptSource {
  /** Stable id recorded on the candidate for traceability. */
  id: string;
  /** `input` is whatever that source needs — a file path/blob for manual, an audio URL for a future ASR service. Deliberately unknown-typed for the same reason ContentProvider's sourceConfig is: the engine never interprets it. */
  loadTranscript(input: unknown): Promise<TranscriptCandidate>;
}

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckId =
  | "duration_consistency"
  | "title_alignment"
  | "intro_present"
  | "outro_present"
  | "speaker_consistency"
  | "description_overlap";

export interface VerificationCheck {
  id: CheckId;
  status: CheckStatus;
  /** Human-readable, specific enough to act on — this is what gets reported back when a transcript is rejected. */
  detail: string;
  /** 0..1 contribution before weighting. */
  score: number;
}

export interface VerificationResult {
  /** 0..1 weighted confidence across every check that could actually run. */
  confidence: number;
  verdict: "accept" | "reject";
  checks: VerificationCheck[];
  /** Empty on accept. On reject, exactly why — never just "low confidence". */
  rejectionReasons: string[];
}
