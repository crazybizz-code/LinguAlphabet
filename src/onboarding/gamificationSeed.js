// ============================================================
// gamificationSeed.js — onboarding-completion gamification seed
// ============================================================
// Reads the learner's current XP/streak from UserState (the runtime
// authority — see LearningBrainProfile Architecture in the engineering
// plan) and derives the seed values the builder stamps into
// profile.gamification. currentLeague uses the DEFAULT_LEAGUE
// placeholder from profile/learningBrainProfile.js because
// profile/leagues.js (the real ladder) is a later phase.
//
// Declarative, not incremental: this computes the *target* XP value
// from the current stored XP each time it's called, rather than
// mutating UserState.xp directly — so re-running initialization after
// a failure (idempotent resume) never double-applies the completion
// bonus, since the base it's computed from doesn't change until the
// runner's single atomic commit actually persists it.

import { DEFAULT_LEAGUE } from '../profile/learningBrainProfile.js';

// Matches the existing Sprint 1 onboarding-completion bonus
// (generateLearningPlan()'s UserState.addXP(50)) for continuity.
export const ONBOARDING_COMPLETION_XP_BONUS = 50;

/**
 * @param {{ get: (key: string) => any }} userState
 */
export function computeGamificationSeed(userState) {
  const currentStreak = Number(userState.get('streak')) || 0;
  const currentXP = Number(userState.get('xp')) || 0;

  return {
    learningStreak: currentStreak,
    currentXP: currentXP + ONBOARDING_COMPLETION_XP_BONUS,
    currentLeague: DEFAULT_LEAGUE,
  };
}
