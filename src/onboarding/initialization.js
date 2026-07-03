// ============================================================
// initialization.js — Learning Brain Initialization Runner
// ============================================================
// Turns completed onboarding answers into the user's first
// LearningBrainProfile and commits it. Five steps, each announced by
// one of the exact product-approved progress messages, each backed
// by real work — never a simulated delay standing in for fake AI
// work.
//
// ATOMICITY (product decision): nothing is persisted to UserState
// until the very last step. Steps 1-4 build the profile up entirely
// in memory; only step 5 performs the single UserState.update() that
// makes it durable. This is what makes the runner safe to interrupt
// and safe to retry:
//   - A crash, thrown error, or closed tab at any point before step 5
//     leaves UserState untouched and the OnboardingStore's answers
//     untouched — nothing is corrupted, nothing is lost.
//   - Re-invoking runInitialization() is always a fresh, independent
//     attempt: it rebuilds everything from the same durable inputs
//     (the OnboardingStore's answers + UserState's current XP/streak),
//     so a failed attempt requires no special "resume from step N"
//     logic — resuming IS re-running.
//   - The gamification seed is computed declaratively from UserState's
//     *current* stored XP each time (see gamificationSeed.js), so a
//     retried run never double-applies the onboarding XP bonus.
//
// Precondition: `userState` must already be loaded (main.js's boot()
// guarantees this in production, long before onboarding runs). This
// runner only ever calls .get()/.update() on it — it never calls
// .load() itself, keeping its dependency on UserState to the minimal
// two-method surface it actually needs.

import { onboardingStore } from './store.js';
import { UserState } from '../db.js';
import { getInitialData } from '../data.js';
import { buildLearningBrainProfile } from '../profile/profileBuilder.js';
import { assertValidLearningBrain } from '../profile/learningBrainProfile.js';
import { buildAnswersFromStore, isOnboardingAnswersComplete } from './answersAdapter.js';
import { computeGamificationSeed } from './gamificationSeed.js';
import { resolveFirstSession } from './firstSession.js';

export const INITIALIZATION_STEPS = Object.freeze([
  'Saving your preferences...',
  'Creating your learning profile...',
  'Preparing your first lesson...',
  'Building your personalized roadmap...',
  'Personalizing your AI Coach...',
]);

const DEFAULT_MIN_STEP_DURATION_MS = 700;

export class InitializationError extends Error {
  constructor(message, { step, cause } = {}) {
    super(message);
    this.name = 'InitializationError';
    this.step = step;
    this.cause = cause;
  }
}

async function withMinDuration(taskFn, minMs) {
  const start = Date.now();
  const result = await taskFn();
  if (minMs > 0) {
    const elapsed = Date.now() - start;
    if (elapsed < minMs) {
      await new Promise(resolve => setTimeout(resolve, minMs - elapsed));
    }
  }
  return result;
}

function isGuestUser(userState) {
  const userId = userState.get('userId');
  return Boolean(userState.get('isGuest')) || (typeof userId === 'string' && userId.startsWith('guest_'));
}

/**
 * The sole persistence point. Builds the final on-disk shape (stamps
 * sync.syncPending based on guest status) and performs one
 * UserState.update() carrying the learningBrain plus the legacy
 * mirror fields existing code already reads directly
 * (targetGoal, dailyTimeGoal, hasCompletedAssessment).
 */
function commitProfile(profile, userState) {
  const finalized = {
    ...profile,
    sync: { ...profile.sync, syncPending: isGuestUser(userState) },
  };

  // Final checkpoint on the exact shape about to be written — cheap,
  // and it's the only validation pass that has seen the sync field.
  assertValidLearningBrain(finalized);

  userState.update({
    learningBrain: finalized,
    hasCompletedAssessment: true,
    targetGoal: finalized.plan.targetGoal,
    dailyTimeGoal: finalized.plan.dailyTimeGoalMinutes,
  });

  return finalized;
}

/**
 * @param {object} [options]
 * @param {(event: { index: number, total: number, message: string }) => void} [options.onProgress]
 * @param {object} [options.store] - defaults to the shared onboardingStore singleton
 * @param {object} [options.userState] - defaults to the shared UserState singleton; must already be loaded
 * @param {Array<object>} [options.catalog] - podcast catalog; defaults to getInitialData().podcasts
 * @param {() => string} [options.now] - injectable clock for tests
 * @param {number} [options.minStepDurationMs] - per-step minimum display time; 0 for instant tests
 * @returns {Promise<object>} the committed LearningBrainProfile
 * @throws {InitializationError} on any failure; UserState and the OnboardingStore are left untouched
 */
export async function runInitialization({
  onProgress,
  store = onboardingStore,
  userState = UserState,
  catalog,
  now = () => new Date().toISOString(),
  minStepDurationMs = DEFAULT_MIN_STEP_DURATION_MS,
} = {}) {
  let stepIndex = 0;

  async function runStep(message, taskFn) {
    const index = stepIndex;
    stepIndex += 1;
    onProgress?.({ index, total: INITIALIZATION_STEPS.length, message });

    try {
      return await withMinDuration(taskFn, minStepDurationMs);
    } catch (error) {
      if (error instanceof InitializationError) throw error;
      throw new InitializationError(`Initialization failed during "${message}"`, { step: message, cause: error });
    }
  }

  let builderAnswers;
  let profile;

  await runStep(INITIALIZATION_STEPS[0], async () => {
    const storeAnswers = store.getAnswers();
    if (!isOnboardingAnswersComplete(storeAnswers)) {
      throw new Error('Onboarding answers are incomplete; cannot start initialization.');
    }
    const displayName = userState.get('username') || '';
    builderAnswers = buildAnswersFromStore(storeAnswers, { displayName });
  });

  await runStep(INITIALIZATION_STEPS[1], async () => {
    const gamification = computeGamificationSeed(userState);
    profile = buildLearningBrainProfile(builderAnswers, { now, gamification });
  });

  await runStep(INITIALIZATION_STEPS[2], async () => {
    const podcasts = catalog ?? getInitialData().podcasts;
    const firstSession = resolveFirstSession(profile, podcasts);
    profile = { ...profile, firstSession };
  });

  await runStep(INITIALIZATION_STEPS[3], async () => {
    assertValidLearningBrain(profile);
  });

  await runStep(INITIALIZATION_STEPS[4], async () => {
    profile = commitProfile(profile, userState);
    // Onboarding is durably complete; the draft has no further purpose.
    // Only cleared after a successful commit — never on failure.
    store.clear();
  });

  return profile;
}
