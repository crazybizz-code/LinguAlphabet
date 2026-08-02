import type { TranscriptSegment } from "@/types/content";
import type { RawContentItem } from "../types";
import type { TranscriptCandidate } from "./types";
import { parseTranscript } from "./manual-source";
import { verifyTranscript } from "./verify";
import type { Transcriber } from "./asr";

/**
 * Transcript Resolution — the pipeline's one podcast-specific stage.
 *
 * Turns whatever reference a provider supplied into verified segments,
 * or returns null so the item is dropped before any AI spend. Same
 * ordering the manual path has always used: verify first, enrich second,
 * because a rejected episode should cost nothing.
 *
 * The three provenances share this function deliberately. A publisher
 * transcript, an operator-typed one and (later) an ASR one differ in
 * where the text comes from, not in what makes it trustworthy — so they
 * all run the same verification, and swapping ASR in changes the `kind`
 * a provider emits, nothing here.
 */
export interface ResolveOptions {
  fetchImpl?: typeof fetch;
  /**
   * Required to resolve an `asr` ref. Injected rather than imported so
   * this stage stays testable without a Python subprocess, and so a
   * pipeline run that has NOT been given a transcriber drops ASR items
   * instead of silently publishing them transcript-less.
   */
  transcribe?: Transcriber;
}

export async function resolveTranscript(
  raw: RawContentItem,
  options: ResolveOptions = {},
): Promise<TranscriptSegment[] | null> {
  const ref = raw.transcriptRef;
  if (!ref) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  let segments: TranscriptSegment[];

  if (ref.kind === "asr") {
    // Generated, not found. Everything after this point is identical to
    // the publisher path on purpose — the transcript is not trusted more
    // because we made it, and verification below is the same gate.
    if (!options.transcribe) return null;
    const result = await options.transcribe(ref.audioUrl, raw.audio?.durationSeconds);
    if (!result || result.segments.length === 0) return null;
    segments = result.segments;
  } else {
    let text: string;
    if (ref.kind === "inline") {
      text = ref.text;
    } else {
      try {
        const response = await fetchImpl(ref.url);
        if (!response.ok) return null;
        text = await response.text();
      } catch {
        return null;
      }
    }

    try {
      segments = parseTranscript(text);
    } catch {
      // A malformed transcript is a rejected episode, not a failed run —
      // the pipeline's per-item handling records it and moves on.
      return null;
    }
  }

  if (segments.length === 0) return null;

  const candidate: TranscriptCandidate = {
    sourceId: raw.transcriptProvenance ?? "publisher",
    segments,
    text: segments.map((segment) => segment.text).join(" "),
  };

  // The same verification the human-in-the-loop path runs — duration
  // consistency and speaker consistency are hard gates, so a transcript
  // that is the wrong length for the audio, or that belongs to a
  // different episode, is rejected here rather than published.
  const verification = verifyTranscript(candidate, {
    audioUrl: raw.audio?.url ?? "",
    title: raw.title,
    description: raw.description,
    durationSeconds: raw.audio?.durationSeconds,
  });

  return verification.verdict === "accept" ? segments : null;
}
