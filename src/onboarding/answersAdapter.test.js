import { describe, it, expect } from 'vitest';
import { buildAnswersFromStore, isOnboardingAnswersComplete } from './answersAdapter.js';
import { buildLearningBrainProfile } from '../profile/profileBuilder.js';
import { validateLearningBrain } from '../profile/learningBrainProfile.js';

describe('buildAnswersFromStore (Learning Brain Builder Integration)', () => {
  it('reshapes flat store answers into the namespaced builder input', () => {
    const storeAnswers = {
      targetGoal: 'Business English',
      selectedLevel: 'Intermediate',
      needsLevelAssessment: false,
      dailyTimeGoalMinutes: 30,
      tags: ['Career'],
      freeText: 'because reasons',
    };

    expect(buildAnswersFromStore(storeAnswers, { displayName: 'Yodgor' })).toEqual({
      identity: { displayName: 'Yodgor', learningReason: null },
      level: { selectedLevel: 'Intermediate', needsLevelAssessment: false },
      plan: { targetGoal: 'Business English', dailyTimeGoalMinutes: 30 },
      motivation: { tags: ['Career'], freeText: 'because reasons' },
    });
  });

  it('produces builder output that passes full schema validation (real integration, not a mock)', () => {
    const storeAnswers = {
      targetGoal: 'Travel English',
      selectedLevel: 'Advanced',
      needsLevelAssessment: false,
      dailyTimeGoalMinutes: 45,
      tags: ['Travel'],
      freeText: '',
    };
    const profile = buildLearningBrainProfile(buildAnswersFromStore(storeAnswers, { displayName: 'A' }));
    expect(validateLearningBrain(profile).valid).toBe(true);
  });

  it('defaults gracefully when the store has nothing yet', () => {
    expect(buildAnswersFromStore({})).toEqual({
      identity: { displayName: '', learningReason: null },
      level: { selectedLevel: null, needsLevelAssessment: false },
      plan: { targetGoal: null, dailyTimeGoalMinutes: null },
      motivation: { tags: [], freeText: '' },
    });
  });

  it('handles the "I don\'t know my level" shape from level.collect() directly, unmodified', () => {
    const result = buildAnswersFromStore({ selectedLevel: null, needsLevelAssessment: true });
    expect(result.level).toEqual({ selectedLevel: null, needsLevelAssessment: true });
  });
});

describe('isOnboardingAnswersComplete', () => {
  const COMPLETE = {
    targetGoal: 'General English',
    selectedLevel: 'Intermediate',
    needsLevelAssessment: false,
    dailyTimeGoalMinutes: 20,
    tags: ['Career'],
    freeText: '',
  };

  it('is true when every stage has a real answer', () => {
    expect(isOnboardingAnswersComplete(COMPLETE)).toBe(true);
  });

  it('is true for "I don\'t know my level" in place of a concrete level', () => {
    expect(isOnboardingAnswersComplete({ ...COMPLETE, selectedLevel: null, needsLevelAssessment: true })).toBe(true);
  });

  it('is true when motivation is satisfied by free text alone', () => {
    expect(isOnboardingAnswersComplete({ ...COMPLETE, tags: [], freeText: 'because' })).toBe(true);
  });

  it('is false with no answers at all', () => {
    expect(isOnboardingAnswersComplete({})).toBe(false);
    expect(isOnboardingAnswersComplete(null)).toBe(false);
  });

  it('is false when the goal is missing', () => {
    expect(isOnboardingAnswersComplete({ ...COMPLETE, targetGoal: null })).toBe(false);
  });

  it('is false when neither a level nor needsLevelAssessment is set', () => {
    expect(isOnboardingAnswersComplete({ ...COMPLETE, selectedLevel: null, needsLevelAssessment: false })).toBe(false);
  });

  it('is false when the selected level is not a recognized level string', () => {
    expect(isOnboardingAnswersComplete({ ...COMPLETE, selectedLevel: 'Fluent' })).toBe(false);
  });

  it('is false when the daily commitment is missing or non-positive', () => {
    expect(isOnboardingAnswersComplete({ ...COMPLETE, dailyTimeGoalMinutes: null })).toBe(false);
    expect(isOnboardingAnswersComplete({ ...COMPLETE, dailyTimeGoalMinutes: 0 })).toBe(false);
  });

  it('is false when neither tags nor free text is provided', () => {
    expect(isOnboardingAnswersComplete({ ...COMPLETE, tags: [], freeText: '' })).toBe(false);
    expect(isOnboardingAnswersComplete({ ...COMPLETE, tags: [], freeText: '   ' })).toBe(false);
  });
});
