import type { ScriptLine } from "./types";

/**
 * Reader-facing transcript text must be the actual spoken words only.
 * Bracket prosody directions ([emphasis], [quiet, lower voice], etc.) are
 * Fish Audio synthesis directives, never spoken aloud — verified
 * extensively across this project via faster-whisper transcription — so
 * they must never reach a learner-visible transcript. This is the ONE
 * place that stripping happens, so fishAudio.ts (which needs the tags)
 * and this module (which must not show them) can never drift apart by
 * each doing their own ad-hoc regex.
 */
export function stripProsodyTags(text: string): string {
  const withoutWellFormedTags = text.replace(/\[[^\]]+\]\s*/g, "");
  // Security-audit finding (LOW), defense-in-depth: scriptGeneration.ts's
  // validateGeneratedScript() now rejects unclosed brackets before a
  // script ever reaches this function, but this module is also used for
  // hand-authored/precomputed episodes that never go through that
  // validator (see EpisodeInput.precomputedAudio). A stray, unmatched "["
  // or "]" would otherwise survive the regex above unchanged and appear
  // literally in the learner-facing transcript -- stripped here as a
  // second, independent layer so the reader-facing transcript can never
  // contain a bracket character regardless of how the script was produced.
  return withoutWellFormedTags.replace(/[[\]]/g, "").trim();
}

export interface ReaderTranscriptSegment {
  speaker: string;
  text: string;
}

/** The pre-alignment transcript shape — real timestamps are filled in by
 * alignTranscript.mjs against the actual generated audio, never estimated. */
export function buildReaderTranscript(script: ScriptLine[]): ReaderTranscriptSegment[] {
  return script.map(([speaker, text]) => ({ speaker, text: stripProsodyTags(text) }));
}
