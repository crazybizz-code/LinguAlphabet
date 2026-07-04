// ============================================================
// answersAdapter.js — Onboarding Store answers → Builder input
// ============================================================
// The Learning Brain Builder Integration seam (Phase C, item 1).
// Stage collect() output accumulates into the OnboardingStore as a
// flat, per-stage-field object (goal.collect() -> { targetGoal },
// level.collect() -> { selectedLevel, needsLevelAssessment }, etc).
// profileBuilder.buildLearningBrainProfile() expects that same data
// namespaced by profile section ({ identity, level, plan, motivation
// }). This module is purely that reshaping — it does not duplicate
// any of the builder's own defaulting/validation logic, and it does
// not duplicate any stage's rendering or selection logic.
//
// Pure functions only: no DOM, no localStorage, no UserState. The
// caller (initialization.js) is responsible for sourcing `displayName`
// (from UserState) and passing it in.

import { LEARNING_LEVELS } from '../profile/learningBrainProfile.js';

/**
 * @param {object} storeAnswers - OnboardingStore.getAnswers() output
 * @param {object} [context]
 * @param {string} [context.displayName] - sourced from UserState by the caller
 * @returns {object} answers shaped for profileBuilder.buildLearningBrainProfile()
 */
export function buildAnswersFromStore(storeAnswers, { displayName = '' } = {}) {
  const answers = storeAnswers || {};

  return {
    identity: {
      displayName: displayName || '',
      // Not collected by any Phase B stage (no Learning Reason stage
      // this phase) — stays null, matching the schema default.
      learningReason: null,
    },
    level: {
      selectedLevel: answers.selectedLevel ?? null,
      needsLevelAssessment: Boolean(answers.needsLevelAssessment),
    },
    plan: {
      targetGoal: answers.targetGoal ?? null,
      dailyTimeGoalMinutes: answers.dailyTimeGoalMinutes ?? null,
    },
    motivation: {
      tags: Array.isArray(answers.tags) ? answers.tags : [],
      freeText: typeof answers.freeText === 'string' ? answers.freeText : '',
    },
  };
}

/**
 * Checks that every Phase B stage has a genuine answer on record —
 * distinct from schema validity (a builder-valid profile can still
 * have a null targetGoal; this checks the *product* rule that each
 * stage's own validate() would require before letting the user move
 * on). Re-expressed here, rather than calling each stage's validate()
 * directly, because that method operates on live mounted DOM/chip-group
 * state — the runner only has the store's persisted, flat answers to
 * work with.
 *
 * @param {object} storeAnswers - OnboardingStore.getAnswers() output
 * @returns {boolean}
 */
export function isOnboardingAnswersComplete(storeAnswers) {
  const answers = storeAnswers || {};

  const hasGoal = typeof answers.targetGoal === 'string' && answers.targetGoal.length > 0;

  const hasLevel = answers.needsLevelAssessment === true
    || (typeof answers.selectedLevel === 'string' && LEARNING_LEVELS.includes(answers.selectedLevel));

  const hasCommitment = typeof answers.dailyTimeGoalMinutes === 'number'
    && Number.isFinite(answers.dailyTimeGoalMinutes)
    && answers.dailyTimeGoalMinutes > 0;

  const hasMotivation = (Array.isArray(answers.tags) && answers.tags.length > 0)
    || (typeof answers.freeText === 'string' && answers.freeText.trim().length > 0);

  return hasGoal && hasLevel && hasCommitment && hasMotivation;
}
