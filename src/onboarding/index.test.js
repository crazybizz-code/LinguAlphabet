import { describe, it, expect } from 'vitest';
import { isOnboardingComplete } from './index.js';

function fakeUserState(data = {}) {
  return { get: (key) => data[key] };
}

describe('isOnboardingComplete', () => {
  it('is true when the LearningBrainProfile says onboarding is complete', () => {
    expect(isOnboardingComplete(fakeUserState({ learningBrain: { onboardingCompleted: true } }))).toBe(true);
  });

  it('is true for a legacy user with no learningBrain but the legacy flag set', () => {
    expect(isOnboardingComplete(fakeUserState({ hasCompletedAssessment: true, learningBrain: null }))).toBe(true);
  });

  it('is false for a brand-new user with neither', () => {
    expect(isOnboardingComplete(fakeUserState({}))).toBe(false);
  });

  it('is false when a learningBrain exists but onboarding is not yet complete', () => {
    expect(isOnboardingComplete(fakeUserState({ learningBrain: { onboardingCompleted: false } }))).toBe(false);
  });

  it('never throws on a malformed learningBrain value', () => {
    expect(() => isOnboardingComplete(fakeUserState({ learningBrain: 'garbage' }))).not.toThrow();
  });
});
