import { describe, it, expect } from 'vitest';
import { reconcileOnboardingCompletionState } from './guestMigration.js';

function fakeUserState(data = {}) {
  const state = { hasCompletedAssessment: false, learningBrain: null, ...data };
  return {
    get: (key) => state[key],
    update: (patch) => Object.assign(state, patch),
    snapshot: () => ({ ...state }),
  };
}

describe('reconcileOnboardingCompletionState', () => {
  it('sets hasCompletedAssessment true when the current learningBrain is complete (guest -> signup, Case A)', () => {
    const userState = fakeUserState({
      hasCompletedAssessment: false, // e.g. the signup handler's old hardcoded default
      learningBrain: { onboardingCompleted: true, plan: { targetGoal: 'General English' } },
    });

    const result = reconcileOnboardingCompletionState(userState);

    expect(result).toBe(true);
    expect(userState.snapshot().hasCompletedAssessment).toBe(true);
  });

  it('sets hasCompletedAssessment false when there is no learningBrain (brand-new guest/account)', () => {
    const userState = fakeUserState({ hasCompletedAssessment: true, learningBrain: null });

    const result = reconcileOnboardingCompletionState(userState);

    expect(result).toBe(false);
    expect(userState.snapshot().hasCompletedAssessment).toBe(false);
  });

  it('sets hasCompletedAssessment false when learningBrain exists but onboarding is not complete', () => {
    const userState = fakeUserState({ learningBrain: { onboardingCompleted: false } });
    expect(reconcileOnboardingCompletionState(userState)).toBe(false);
  });

  it('re-derives the flag after a sign-in merge that preserved a local guest brain (Case B: remote had none)', () => {
    // Simulates: guest completed onboarding locally, then signs in to an
    // account with no remote brain. syncFromRemote()'s OR-fallback merge
    // already preserved the local learningBrain, but its own
    // has_completed_assessment handling may have just reset the flag to
    // false because the remote profile explicitly said false.
    const userState = fakeUserState({
      hasCompletedAssessment: false, // stomped by syncFromRemote's own field handling
      learningBrain: { onboardingCompleted: true }, // preserved by the OR-fallback merge
    });

    expect(reconcileOnboardingCompletionState(userState)).toBe(true);
    expect(userState.snapshot().hasCompletedAssessment).toBe(true);
  });

  it('re-derives the flag after a sign-in merge where the remote brain wins (Case B: remote had one)', () => {
    // Simulates: remote account already has a completed brain; the
    // OR-fallback merge replaced local with it.
    const userState = fakeUserState({
      hasCompletedAssessment: true,
      learningBrain: { onboardingCompleted: true },
    });

    expect(reconcileOnboardingCompletionState(userState)).toBe(true);
  });

  it('never throws when learningBrain is a malformed/non-object value', () => {
    const userState = fakeUserState({ learningBrain: 'not-an-object' });
    expect(() => reconcileOnboardingCompletionState(userState)).not.toThrow();
    expect(userState.snapshot().hasCompletedAssessment).toBe(false);
  });
});
