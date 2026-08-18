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
 * what must not happen.
 *
 * The real enforcement is a SINGLE authoritative grading, not two
 * separate ones that can disagree: scriptGeneration.ts's
 * generateEpisodeScript() calls the real generateEnrichment()
 * (ai-processing.ts) once a script passes structural validation, BEFORE
 * Fish Audio synthesis/alignment ever run. A B1-or-below result feeds
 * back into the same bounded retry loop word-count/structural failures
 * already use. That EXACT EnrichmentResult -- not a re-derived or
 * re-graded copy -- is what dailyGenerate.ts publishes, so
 * publishing.ts's quality gate re-checks the SAME judgment already made,
 * not a second independent one, and remains the authoritative,
 * unweakened backstop.
 *
 * (An earlier version of this design ran a separate, hand-written
 * CEFR-only precheck prompt instead of calling the real grader --
 * cheaper per retry attempt, but a real GitHub Actions run proved the two
 * prompts could disagree: the precheck passed a script that the real
 * generateEnrichment() call then graded cefrLevelMin=B1/cefrLevelMax=B2,
 * because the two prompts weren't actually the same task -- different
 * framing, and CEFR was 2 of ~10 simultaneous fields in the authoritative
 * call versus the precheck's sole focus. Replaced with the single-grading
 * design above, which makes that class of disagreement architecturally
 * impossible rather than merely less likely.)
 */

export type LinguAbcCefrLevel = "B2" | "C1" | "C2";

export const LINGUABC_CEFR_LEVELS: readonly LinguAbcCefrLevel[] = ["B2", "C1", "C2"];

export function chooseCefrLevelForEpisode(episodeNumber: number): LinguAbcCefrLevel {
  return LINGUABC_CEFR_LEVELS[(episodeNumber - 1) % LINGUABC_CEFR_LEVELS.length];
}

export function isApprovedLinguAbcCefrLevel(level: unknown): level is LinguAbcCefrLevel {
  return typeof level === "string" && (LINGUABC_CEFR_LEVELS as readonly string[]).includes(level);
}
