// ============================================================
// index.js — onboarding public API
// ============================================================
// The only onboarding/* entry point main.js should import from.
// Everything else (the machine, the stage registry, the store, the
// initialization runner) is an implementation detail behind this.

import { onboardingMachine } from './machine.js';

/**
 * A user has finished onboarding if either the versioned
 * LearningBrainProfile says so, or the legacy flag does (a pre-v2
 * user, or a v2 user before the learningBrain field existed) — so an
 * already-complete user, under either engine, is never re-onboarded.
 *
 * @param {{ get: (key: string) => any }} userState
 */
export function isOnboardingComplete(userState) {
  const learningBrain = userState.get('learningBrain');
  return Boolean(learningBrain?.onboardingCompleted) || Boolean(userState.get('hasCompletedAssessment'));
}

/**
 * Starts (or resumes) the onboarding machine into `container`.
 * @see onboarding/machine.js createOnboardingMachine().start for the options shape.
 */
export function startOnboarding(container, options) {
  return onboardingMachine.start(container, options);
}
