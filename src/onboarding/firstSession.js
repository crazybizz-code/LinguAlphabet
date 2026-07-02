// ============================================================
// firstSession.js — first-lesson selection for the Learning Brain
// ============================================================
// Minimal, real (not simulated) content matching so a completed
// LearningBrainProfile can carry a genuine firstSession instead of
// nulls. This is a deliberate placeholder for the full
// recommendation engine planned for a later phase
// (profile/recommendation.js, per the Sprint 2 engineering plan) —
// it exists now only because Phase C needs a complete profile.
// Callers must not treat this as the final recommendation algorithm.
//
// IMPORTANT: mapping a self-reported level to a content difficulty
// TIER for lesson matching is not the same as mapping it to a CEFR
// value — profile.level.cefrLevel stays null regardless (see
// profile/learningBrainProfile.js and the Phase B product decision).
// This module never reads or writes cefrLevel, and is not the "AI
// level estimation" feature excluded from this phase.

export const FIRST_MISSION_XP_REWARD = 20;

const LEVEL_TO_DIFFICULTY = Object.freeze({
  Beginner: 'Beginner',
  Elementary: 'Beginner',
  'Pre-Intermediate': 'Intermediate',
  Intermediate: 'Intermediate',
  'Upper Intermediate': 'Intermediate',
  Advanced: 'Advanced',
});

const DEFAULT_DIFFICULTY = 'Beginner'; // safest, most accessible starting point when the level is unknown

/**
 * @param {object} profile - the in-progress LearningBrainProfile (only profile.level is read)
 * @param {Array<object>} podcasts - catalog to select from (each item: { podcastId, title, difficulty, ... })
 * @returns {{ recommendedFirstLesson: object|null, firstPodcastId: string|null, firstMission: object|null }}
 */
export function resolveFirstSession(profile, podcasts) {
  const catalog = Array.isArray(podcasts) ? podcasts : [];
  const selectedLevel = profile?.level?.selectedLevel ?? null;

  const targetDifficulty = selectedLevel
    ? (LEVEL_TO_DIFFICULTY[selectedLevel] || DEFAULT_DIFFICULTY)
    : DEFAULT_DIFFICULTY;

  const chosen = catalog.find(podcast => podcast?.difficulty === targetDifficulty) ?? catalog[0] ?? null;

  if (!chosen) {
    return { recommendedFirstLesson: null, firstPodcastId: null, firstMission: null };
  }

  return {
    recommendedFirstLesson: {
      podcastId: chosen.podcastId,
      title: chosen.title,
      reason: selectedLevel ? `Matched to your ${selectedLevel} level` : 'A great accessible starting point',
    },
    firstPodcastId: chosen.podcastId,
    firstMission: {
      title: 'Complete your first lesson',
      description: `Listen to "${chosen.title}" and finish the lesson`,
      xpReward: FIRST_MISSION_XP_REWARD,
    },
  };
}
