import type { CefrLevel } from "@/types/content";
import { cefrIndex, nextCefrLevel } from "../cefr";

export interface RecentCompletion {
  cefrLevel: CefrLevel;
  completedAt: string;
}

const PROGRESSION_WINDOW_DAYS = 30;
const COMPLETIONS_NEEDED_TO_ADVANCE = 3;

/**
 * Layer 4 (docs/domain-model.md "Progression"): a slow-moving signal that
 * adjusts over weeks, not per session. If a learner has repeatedly
 * completed content above their stated level in the last month, widen
 * what Layer 2 scores as a "level match" — this is the mechanism behind
 * the /ai-plan reveal's "Reach B2 in ~8 weeks" actually holding true over
 * time, rather than the scored level staying frozen at onboarding's
 * one-time self-assessment forever.
 */
export const difficultyProgressionStrategy = {
  computeEffectiveLevel(baseLevel: CefrLevel | null, recentCompletions: RecentCompletion[]): CefrLevel | null {
    if (!baseLevel) return baseLevel;

    const windowStart = Date.now() - PROGRESSION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const higherLevelCompletions = recentCompletions.filter(
      (completion) =>
        new Date(completion.completedAt).getTime() >= windowStart && cefrIndex(completion.cefrLevel) > cefrIndex(baseLevel),
    );

    return higherLevelCompletions.length >= COMPLETIONS_NEEDED_TO_ADVANCE ? nextCefrLevel(baseLevel) : baseLevel;
  },
};
