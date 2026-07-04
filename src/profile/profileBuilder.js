// ============================================================
// profileBuilder.js — pure LearningBrainProfile builder
// ============================================================
// Input:  onboarding answers (+ optional pre-resolved seeds)
// Output: a validated LearningBrainProfile
//
// No DOM. No localStorage. No Supabase. No import from onboarding/*
// or main.js. Everything this module needs is passed in as data.
//
// `gamification` and `firstSession` are accepted as optional
// pre-resolved inputs rather than computed here: seeding XP/streak
// and picking a first lesson depend on modules that ship in a later
// phase (profile/leagues.js, profile/recommendation.js). Keeping
// this builder ignorant of them now means their arrival will not
// change this function's contract — callers will simply start
// passing real values instead of leaving them undefined.

import {
  LEARNING_BRAIN_VERSION,
  LEVEL_SOURCES,
  DEFAULT_LEAGUE,
  defaultLearningBrain,
  assertValidLearningBrain,
} from './learningBrainProfile.js';

function buildLevel(levelAnswer, nowIso) {
  const answer = levelAnswer || {};
  const needsLevelAssessment = Boolean(answer.needsLevelAssessment);

  if (needsLevelAssessment) {
    return {
      selectedLevel: null,
      needsLevelAssessment: true,
      levelSource: LEVEL_SOURCES.UNKNOWN,
      cefrLevel: null,
      selectedAt: nowIso,
    };
  }

  const selectedLevel = answer.selectedLevel ?? null;
  return {
    // Stored exactly as chosen — never mapped to a CEFR value here.
    selectedLevel,
    needsLevelAssessment: false,
    levelSource: selectedLevel ? LEVEL_SOURCES.SELF_REPORTED : null,
    cefrLevel: null,
    selectedAt: selectedLevel ? nowIso : null,
  };
}

/**
 * @param {object} answers - collected onboarding answers
 * @param {object} [answers.identity] - { displayName, learningReason }
 * @param {object} [answers.level] - { selectedLevel, needsLevelAssessment }
 * @param {object} [answers.plan] - { targetGoal, dailyTimeGoalMinutes }
 * @param {object} [answers.motivation] - { tags, freeText }
 * @param {object} [seeds] - values owned by modules that don't exist yet
 * @param {object} [seeds.gamification] - { learningStreak, currentXP, currentLeague }
 * @param {object} [seeds.firstSession] - { recommendedFirstLesson, firstPodcastId, firstMission }
 * @param {() => string} [seeds.now] - injectable clock for tests; defaults to Date.now
 * @returns {object} a validated LearningBrainProfile
 */
export function buildLearningBrainProfile(answers = {}, seeds = {}) {
  const base = defaultLearningBrain();
  const nowIso = seeds.now ? seeds.now() : new Date().toISOString();

  const identityAnswer = answers.identity || {};
  const planAnswer = answers.plan || {};
  const motivationAnswer = answers.motivation || {};
  const gamificationSeed = seeds.gamification || {};
  const firstSessionSeed = seeds.firstSession || {};

  const profile = {
    ...base,
    version: LEARNING_BRAIN_VERSION,
    onboardingCompleted: true,
    onboardingCompletedAt: nowIso,

    identity: {
      displayName: typeof identityAnswer.displayName === 'string'
        ? identityAnswer.displayName.trim()
        : base.identity.displayName,
      learningReason: identityAnswer.learningReason ?? base.identity.learningReason,
    },

    level: buildLevel(answers.level, nowIso),

    plan: {
      targetGoal: planAnswer.targetGoal ?? base.plan.targetGoal,
      dailyTimeGoalMinutes: planAnswer.dailyTimeGoalMinutes ?? base.plan.dailyTimeGoalMinutes,
    },

    motivation: {
      tags: Array.isArray(motivationAnswer.tags) ? [...motivationAnswer.tags] : base.motivation.tags,
      freeText: typeof motivationAnswer.freeText === 'string'
        ? motivationAnswer.freeText.trim()
        : base.motivation.freeText,
    },

    gamification: {
      learningStreak: gamificationSeed.learningStreak ?? base.gamification.learningStreak,
      currentXP: gamificationSeed.currentXP ?? base.gamification.currentXP,
      currentLeague: gamificationSeed.currentLeague ?? DEFAULT_LEAGUE,
    },

    firstSession: {
      recommendedFirstLesson: firstSessionSeed.recommendedFirstLesson ?? base.firstSession.recommendedFirstLesson,
      firstPodcastId: firstSessionSeed.firstPodcastId ?? base.firstSession.firstPodcastId,
      firstMission: firstSessionSeed.firstMission ?? base.firstSession.firstMission,
    },

    sync: { ...base.sync },
    backfilled: false,
  };

  // Reject invalid output rather than let a malformed profile
  // propagate into UserState/Supabase.
  return assertValidLearningBrain(profile);
}
