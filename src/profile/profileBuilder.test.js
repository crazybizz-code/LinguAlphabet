import { describe, it, expect } from 'vitest';
import { buildLearningBrainProfile } from './profileBuilder.js';
import { LEVEL_SOURCES, validateLearningBrain } from './learningBrainProfile.js';

const FIXED_NOW = '2026-07-02T12:00:00.000Z';
const now = () => FIXED_NOW;

describe('buildLearningBrainProfile', () => {
  it('produces a valid, onboarding-complete profile', () => {
    const profile = buildLearningBrainProfile(
      {
        identity: { displayName: 'Yodgor', learningReason: 'Career' },
        level: { selectedLevel: 'Intermediate', needsLevelAssessment: false },
        plan: { targetGoal: 'General English', dailyTimeGoalMinutes: 20 },
        motivation: { tags: ['career'], freeText: 'I want a promotion' },
      },
      { now },
    );

    expect(validateLearningBrain(profile).valid).toBe(true);
    expect(profile.onboardingCompleted).toBe(true);
    expect(profile.onboardingCompletedAt).toBe(FIXED_NOW);
  });

  describe('level (product decision: store exactly as chosen, no CEFR mapping)', () => {
    it('stores a self-reported level verbatim with no cefrLevel', () => {
      const profile = buildLearningBrainProfile(
        { level: { selectedLevel: 'Upper Intermediate', needsLevelAssessment: false } },
        { now },
      );
      expect(profile.level.selectedLevel).toBe('Upper Intermediate');
      expect(profile.level.cefrLevel).toBeNull();
      expect(profile.level.levelSource).toBe(LEVEL_SOURCES.SELF_REPORTED);
      expect(profile.level.needsLevelAssessment).toBe(false);
      expect(profile.level.selectedAt).toBe(FIXED_NOW);
    });

    it('sets needsLevelAssessment for "I don\'t know my level" with no selectedLevel', () => {
      const profile = buildLearningBrainProfile(
        { level: { needsLevelAssessment: true } },
        { now },
      );
      expect(profile.level.selectedLevel).toBeNull();
      expect(profile.level.needsLevelAssessment).toBe(true);
      expect(profile.level.levelSource).toBe(LEVEL_SOURCES.UNKNOWN);
      expect(profile.level.cefrLevel).toBeNull();
    });

    it('never maps a level string to a CEFR value regardless of which level is chosen', () => {
      for (const level of ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper Intermediate', 'Advanced']) {
        const profile = buildLearningBrainProfile(
          { level: { selectedLevel: level, needsLevelAssessment: false } },
          { now },
        );
        expect(profile.level.cefrLevel).toBeNull();
        expect(profile.level.selectedLevel).toBe(level);
      }
    });

    it('treats a missing level answer as "no level chosen yet" (no selectedLevel, no assessment flag)', () => {
      const profile = buildLearningBrainProfile({}, { now });
      expect(profile.level.selectedLevel).toBeNull();
      expect(profile.level.needsLevelAssessment).toBe(false);
      expect(profile.level.levelSource).toBeNull();
      expect(profile.level.selectedAt).toBeNull();
    });
  });

  describe('defaults for omitted answer sections', () => {
    it('falls back to schema defaults when identity/plan/motivation are omitted', () => {
      const profile = buildLearningBrainProfile({}, { now });
      expect(profile.identity.displayName).toBe('');
      expect(profile.identity.learningReason).toBeNull();
      expect(profile.plan.targetGoal).toBeNull();
      expect(profile.plan.dailyTimeGoalMinutes).toBeNull();
      expect(profile.motivation.tags).toEqual([]);
      expect(profile.motivation.freeText).toBe('');
    });

    it('defaults gamification and firstSession when no seeds are supplied', () => {
      const profile = buildLearningBrainProfile({}, { now });
      expect(profile.gamification.learningStreak).toBe(0);
      expect(profile.gamification.currentXP).toBe(0);
      expect(profile.gamification.currentLeague).toBe('Bronze');
      expect(profile.firstSession.recommendedFirstLesson).toBeNull();
      expect(profile.firstSession.firstPodcastId).toBeNull();
      expect(profile.firstSession.firstMission).toBeNull();
    });
  });

  describe('seeds (values owned by modules that ship in a later phase)', () => {
    it('passes through supplied gamification and firstSession seeds', () => {
      const profile = buildLearningBrainProfile(
        {},
        {
          now,
          gamification: { learningStreak: 3, currentXP: 150, currentLeague: 'Silver' },
          firstSession: {
            recommendedFirstLesson: { podcastId: 'pod_1', title: 'Airport English', reason: 'level match' },
            firstPodcastId: 'pod_1',
            firstMission: { title: 'Finish your first lesson', description: 'Listen for 5 minutes', xpReward: 20 },
          },
        },
      );
      expect(profile.gamification).toEqual({ learningStreak: 3, currentXP: 150, currentLeague: 'Silver' });
      expect(profile.firstSession.firstPodcastId).toBe('pod_1');
      expect(profile.firstSession.firstMission.xpReward).toBe(20);
    });
  });

  describe('text normalization', () => {
    it('trims displayName and freeText whitespace', () => {
      const profile = buildLearningBrainProfile(
        {
          identity: { displayName: '  Yodgor  ' },
          motivation: { freeText: '  because reasons  ' },
        },
        { now },
      );
      expect(profile.identity.displayName).toBe('Yodgor');
      expect(profile.motivation.freeText).toBe('because reasons');
    });
  });

  describe('immutability', () => {
    it('does not let the caller mutate the output via the input tags array', () => {
      const tags = ['career'];
      const profile = buildLearningBrainProfile({ motivation: { tags } }, { now });
      tags.push('travel');
      expect(profile.motivation.tags).toEqual(['career']);
    });
  });

  describe('rejection of invalid input', () => {
    it('throws instead of producing an invalid profile for an unknown level string', () => {
      expect(() =>
        buildLearningBrainProfile(
          { level: { selectedLevel: 'Fluent', needsLevelAssessment: false } },
          { now },
        ),
      ).toThrow();
    });
  });
});
