import type { TranscriptSegment } from "@/types/content";
import type { RawContentItem } from "../types";
import type { TranscriptCandidate } from "./types";
import { parseTranscript } from "./manual-source";
import { verifyTranscript } from "./verify";

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
export async function resolveTranscript(
  raw: RawContentItem,
  fetchImpl: typeof fetch = fetch,
): Promise<TranscriptSegment[] | null> {
  const ref = raw.transcriptRef;
  if (!ref) return null;

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

  let segments: TranscriptSegment[];
  try {
    segments = parseTranscript(text);
  } catch {
    // A malformed transcript is a rejected episode, not a failed run —
    // the pipeline's per-item handling records it and moves on.
    return null;
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
