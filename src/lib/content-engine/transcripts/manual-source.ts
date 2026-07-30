import type { TranscriptSegment } from "@/types/content";
import type { TranscriptCandidate, TranscriptSource } from "./types";

/**
 * The human-in-the-loop transcript source: an operator supplies a
 * transcript file alongside the audio URL and metadata. Deliberately the
 * ONLY place that knows about file formats — verification and enrichment
 * downstream see a parsed TranscriptCandidate and nothing else, which is
 * what lets a future WhisperTranscriptSource replace this file without
 * touching either.
 *
 * Two accepted formats, because both are what real transcript tooling
 * actually emits:
 *   1. JSON — [{ speaker, text, startMs?, endMs? }, ...] (Whisper/
 *      Descript/Otter exports, and the shape podcast_details.transcript
 *      already stores, so it round-trips unchanged).
 *   2. Plain text — "Speaker: line" per paragraph, the shape a human
 *      pastes out of a document.
 *
 * Timestamps are optional on purpose: they're required for the Learning
 * Session's transcript↔audio highlighting, but a transcript without them
 * is still perfectly usable for AI enrichment, and refusing one would
 * block the launch workflow this exists to serve.
 */

const SPEAKER_LINE = /^\s*([A-Za-z][\w .'-]{0,40}?)\s*:\s*(.+)$/;

function isSegmentShape(value: unknown): value is TranscriptSegment {
  if (typeof value !== "object" || value === null) return false;
  const segment = value as Record<string, unknown>;
  return typeof segment.speaker === "string" && typeof segment.text === "string";
}

/**
 * Parses either accepted format into segments. Pure and exported so it's
 * unit-testable independently of any file/network IO.
 *
 * Throws rather than returning empty on unparseable input: "we could not
 * read this file" and "this file contains no speech" are different
 * problems, and collapsing them would let an empty transcript slip into
 * verification as though it were merely a low-quality one.
 */
export function parseTranscript(raw: string): TranscriptSegment[] {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Transcript file is empty.");

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Transcript file looks like JSON but could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const list = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>).segments;
    if (!Array.isArray(list) || !list.every(isSegmentShape)) {
      throw new Error('Transcript JSON must be an array of { speaker, text } objects (optionally with startMs/endMs), or an object with a "segments" array of them.');
    }
    return list.map((segment) => ({
      speaker: segment.speaker.trim(),
      text: segment.text.trim(),
      startMs: typeof segment.startMs === "number" ? segment.startMs : 0,
      endMs: typeof segment.endMs === "number" ? segment.endMs : 0,
    }));
  }

  const segments: TranscriptSegment[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(SPEAKER_LINE);
    if (match) {
      segments.push({ speaker: match[1].trim(), text: match[2].trim(), startMs: 0, endMs: 0 });
      continue;
    }
    // A continuation line belongs to the speaker who is already talking.
    // Only valid once someone has spoken — a file that starts with an
    // unlabelled line has no speaker attribution at all, which the
    // verifier's speaker_consistency hard gate must be allowed to catch
    // rather than this parser silently inventing a label.
    if (segments.length === 0) {
      segments.push({ speaker: "", text: line.trim(), startMs: 0, endMs: 0 });
      continue;
    }
    segments[segments.length - 1].text += ` ${line.trim()}`;
  }

  if (segments.length === 0) throw new Error("Transcript file contains no readable lines.");
  return segments;
}

/** Flattens segments to the plain text the verifier scores and the AI processor enriches. */
export function flattenTranscript(segments: TranscriptSegment[]): string {
  return segments.map((segment) => segment.text).join(" ").replace(/\s+/g, " ").trim();
}

export const manualTranscriptSource: TranscriptSource = {
  id: "manual",
  async loadTranscript(input: unknown): Promise<TranscriptCandidate> {
    if (typeof input !== "string") {
      throw new Error("ManualTranscriptSource expects the transcript file's contents as a string.");
    }
    const segments = parseTranscript(input);
    return { sourceId: "manual", segments, text: flattenTranscript(segments) };
  },
};
