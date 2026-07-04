import { describe, it, expect } from 'vitest';
import {
  LEARNING_BRAIN_VERSION,
  LEVEL_SOURCES,
  LEARNING_LEVELS,
  DEFAULT_LEAGUE,
  defaultLearningBrain,
  validateLearningBrain,
  assertValidLearningBrain,
  migrateLearningBrain,
} from './learningBrainProfile.js';

describe('LEARNING_LEVELS', () => {
  it('is the canonical 6-option vocabulary (excludes the "I don\'t know" flag)', () => {
    expect(LEARNING_LEVELS).toEqual([
      'Beginner',
      'Elementary',
      'Pre-Intermediate',
      'Intermediate',
      'Upper Intermediate',
      'Advanced',
    ]);
  });
});

describe('defaultLearningBrain', () => {
  it('produces a schema-valid profile', () => {
    const { valid, errors } = validateLearningBrain(defaultLearningBrain());
    expect(valid, errors.join('; ')).toBe(true);
  });

  it('is not onboarding-complete and has no CEFR level', () => {
    const profile = defaultLearningBrain();
    expect(profile.onboardingCompleted).toBe(false);
    expect(profile.level.cefrLevel).toBeNull();
    expect(profile.level.selectedLevel).toBeNull();
    expect(profile.gamification.currentLeague).toBe(DEFAULT_LEAGUE);
  });

  it('returns a fresh object on every call (no shared mutable state)', () => {
    const a = defaultLearningBrain();
    const b = defaultLearningBrain();
    a.motivation.tags.push('career');
    expect(b.motivation.tags).toEqual([]);
  });
});

describe('validateLearningBrain', () => {
  it('rejects non-object input', () => {
    expect(validateLearningBrain(null).valid).toBe(false);
    expect(validateLearningBrain(undefined).valid).toBe(false);
    expect(validateLearningBrain('profile').valid).toBe(false);
    expect(validateLearningBrain([]).valid).toBe(false);
  });

  it('rejects an empty object with field-level errors', () => {
    const { valid, errors } = validateLearningBrain({});
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a version outside the supported range', () => {
    const profile = defaultLearningBrain();
    profile.version = 0;
    expect(validateLearningBrain(profile).valid).toBe(false);

    profile.version = LEARNING_BRAIN_VERSION + 1;
    expect(validateLearningBrain(profile).valid).toBe(false);
  });

  it('rejects a non-boolean onboardingCompleted', () => {
    const profile = defaultLearningBrain();
    profile.onboardingCompleted = 'yes';
    expect(validateLearningBrain(profile).valid).toBe(false);
  });

  it('rejects an unknown selectedLevel value', () => {
    const profile = defaultLearningBrain();
    profile.level.selectedLevel = 'Native Speaker';
    profile.level.levelSource = LEVEL_SOURCES.SELF_REPORTED;
    expect(validateLearningBrain(profile).valid).toBe(false);
  });

  it('rejects motivation.tags containing non-strings', () => {
    const profile = defaultLearningBrain();
    profile.motivation.tags = ['career', 42];
    expect(validateLearningBrain(profile).valid).toBe(false);
  });

  it('rejects negative gamification values', () => {
    const profile = defaultLearningBrain();
    profile.gamification.currentXP = -1;
    expect(validateLearningBrain(profile).valid).toBe(false);
  });

  it('rejects an empty currentLeague string', () => {
    const profile = defaultLearningBrain();
    profile.gamification.currentLeague = '';
    expect(validateLearningBrain(profile).valid).toBe(false);
  });

  it('rejects a non-boolean sync.syncPending', () => {
    const profile = defaultLearningBrain();
    profile.sync.syncPending = 'false';
    expect(validateLearningBrain(profile).valid).toBe(false);
  });

  it('rejects a non-boolean backfilled flag', () => {
    const profile = defaultLearningBrain();
    profile.backfilled = 'no';
    expect(validateLearningBrain(profile).valid).toBe(false);
  });

  describe('level invariants (product decision: no CEFR mapping from self-selection)', () => {
    it('rejects cefrLevel set when levelSource is self-reported', () => {
      const profile = defaultLearningBrain();
      profile.level.selectedLevel = 'Intermediate';
      profile.level.levelSource = LEVEL_SOURCES.SELF_REPORTED;
      profile.level.cefrLevel = 'B1';
      const { valid, errors } = validateLearningBrain(profile);
      expect(valid).toBe(false);
      expect(errors.some(e => e.includes('cefrLevel'))).toBe(true);
    });

    it('rejects cefrLevel set when levelSource is unknown', () => {
      const profile = defaultLearningBrain();
      profile.level.needsLevelAssessment = true;
      profile.level.levelSource = LEVEL_SOURCES.UNKNOWN;
      profile.level.cefrLevel = 'A1';
      expect(validateLearningBrain(profile).valid).toBe(false);
    });

    it('allows cefrLevel only when levelSource is the reserved ai-estimated value', () => {
      const profile = defaultLearningBrain();
      profile.level.levelSource = LEVEL_SOURCES.AI_ESTIMATED;
      profile.level.cefrLevel = 'B1';
      const { valid, errors } = validateLearningBrain(profile);
      expect(valid, errors.join('; ')).toBe(true);
    });

    it('rejects a selectedLevel present alongside needsLevelAssessment: true', () => {
      const profile = defaultLearningBrain();
      profile.level.needsLevelAssessment = true;
      profile.level.selectedLevel = 'Beginner';
      expect(validateLearningBrain(profile).valid).toBe(false);
    });

    it('rejects a self-reported level with no selectedLevel', () => {
      const profile = defaultLearningBrain();
      profile.level.levelSource = LEVEL_SOURCES.SELF_REPORTED;
      profile.level.selectedLevel = null;
      expect(validateLearningBrain(profile).valid).toBe(false);
    });
  });
});

describe('assertValidLearningBrain', () => {
  it('returns the profile unchanged when valid', () => {
    const profile = defaultLearningBrain();
    expect(assertValidLearningBrain(profile)).toBe(profile);
  });

  it('throws a descriptive error when invalid', () => {
    const profile = defaultLearningBrain();
    profile.gamification.currentXP = -5;
    expect(() => assertValidLearningBrain(profile)).toThrow(/currentXP/);
  });
});

describe('migrateLearningBrain', () => {
  it('rejects non-object input', () => {
    expect(migrateLearningBrain(null)).toBeNull();
    expect(migrateLearningBrain('nope')).toBeNull();
  });

  it('rejects a missing or non-integer version', () => {
    expect(migrateLearningBrain({})).toBeNull();
    expect(migrateLearningBrain({ version: 'not-a-number' })).toBeNull();
    expect(migrateLearningBrain({ version: 1.5 })).toBeNull();
  });

  it('rejects a version below 1', () => {
    expect(migrateLearningBrain({ version: 0 })).toBeNull();
  });

  it('rejects a version newer than this client supports', () => {
    expect(migrateLearningBrain({ version: LEARNING_BRAIN_VERSION + 1 })).toBeNull();
  });

  it('completes a partial v1 document by merging onto defaults', () => {
    const partial = { version: 1, identity: { displayName: 'Yodgor' } };
    const migrated = migrateLearningBrain(partial);
    expect(migrated).not.toBeNull();
    expect(migrated.version).toBe(LEARNING_BRAIN_VERSION);
    expect(migrated.identity.displayName).toBe('Yodgor');
    expect(migrated.identity.learningReason).toBeNull(); // filled from defaults
    expect(validateLearningBrain(migrated).valid).toBe(true);
  });

  it('preserves nested valid values instead of overwriting them with defaults', () => {
    const partial = {
      version: 1,
      motivation: { tags: ['career', 'travel'], freeText: 'because' },
    };
    const migrated = migrateLearningBrain(partial);
    expect(migrated.motivation.tags).toEqual(['career', 'travel']);
    expect(migrated.motivation.freeText).toBe('because');
  });

  it('returns null if the merged result is still structurally invalid', () => {
    const partial = { version: 1, gamification: { currentXP: -10 } };
    expect(migrateLearningBrain(partial)).toBeNull();
  });
});
