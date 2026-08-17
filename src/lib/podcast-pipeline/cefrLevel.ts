/**
 * LinguABC AI-generated podcast level policy.
 *
 * Our own generated episodes may ONLY ever be B2, C1, or C2 -- B1 is
 * explicitly reserved for external content (NOAA English / the existing
 * external-content pipeline), never the AI generator. Deliberately
 * stateless and rotation-based, the same pattern voiceRotation.ts already
 * uses: the level is derived from the real episode number, not tracked in
 * a separate table.
 *
 * This module only decides which level the SCRIPT GENERATOR is asked to
 * target. It does not, by itself, guarantee the final published episode
 * is actually at that level -- a script generator asked for B2 could
 * still produce text that reads as B1, and simply trusting its own
 * self-report would be "merely labeling a B1 script as B2" -- exactly
 * what must not happen. Two independent checks exist specifically to
 * catch that: scriptGeneration.ts's checkGeneratedCefrLevel() grades the
 * actual generated text BEFORE Fish Audio synthesis/alignment ever run,
 * feeding a miss back into the same bounded retry loop word-count/
 * structural failures already use, so a mismatch is cheap to fix; and
 * generateEnrichment() (ai-processing.ts) independently judges the final
 * published transcript, with publishing.ts's quality gate rejecting
 * publication outright if that judgment still falls outside {B2, C1, C2}.
 * The quality gate is the authoritative, unweakened backstop -- the
 * earlier check exists to make it rare for that backstop to ever fire on
 * an AI-generated episode, not to replace it.
 */

export type LinguAbcCefrLevel = "B2" | "C1" | "C2";

export const LINGUABC_CEFR_LEVELS: readonly LinguAbcCefrLevel[] = ["B2", "C1", "C2"];

export function chooseCefrLevelForEpisode(episodeNumber: number): LinguAbcCefrLevel {
  return LINGUABC_CEFR_LEVELS[(episodeNumber - 1) % LINGUABC_CEFR_LEVELS.length];
}

export function isApprovedLinguAbcCefrLevel(level: unknown): level is LinguAbcCefrLevel {
  return typeof level === "string" && (LINGUABC_CEFR_LEVELS as readonly string[]).includes(level);
}
