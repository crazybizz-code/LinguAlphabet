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
 * is actually at that level -- generateEnrichment() independently judges
 * the actual produced text's CEFR range (see ai-processing.ts), and
 * publishing.ts's quality gate rejects publication if that independent
 * judgment falls outside {B2, C1, C2}. That two-step design is
 * deliberate: a script generator asked for B2 could still produce text
 * that reads as B1, and simply trusting its own self-report would be
 * "merely labeling a B1 script as B2" -- exactly what must not happen.
 */

export type LinguAbcCefrLevel = "B2" | "C1" | "C2";

export const LINGUABC_CEFR_LEVELS: readonly LinguAbcCefrLevel[] = ["B2", "C1", "C2"];

export function chooseCefrLevelForEpisode(episodeNumber: number): LinguAbcCefrLevel {
  return LINGUABC_CEFR_LEVELS[(episodeNumber - 1) % LINGUABC_CEFR_LEVELS.length];
}

export function isApprovedLinguAbcCefrLevel(level: unknown): level is LinguAbcCefrLevel {
  return typeof level === "string" && (LINGUABC_CEFR_LEVELS as readonly string[]).includes(level);
}
