// ============================================================
// learningBrainProfile.js — LearningBrainProfile schema (v1)
// ============================================================
// Pure data-shape module: defaults, validation, and version
// migration for the onboarding output artifact. No DOM, no
// localStorage, no Supabase access — this module only knows
// about the shape of the profile.
//
// Product decision (Sprint 2, Phase A): self-selected levels are
// NEVER mapped to a CEFR value. `cefrLevel` stays null until a
// future AI-estimation feature sets it (levelSource: 'ai-estimated').

export const LEARNING_BRAIN_VERSION = 1;

export const LEVEL_SOURCES = Object.freeze({
  SELF_REPORTED: 'self-reported',
  UNKNOWN: 'unknown',
  // Reserved for the future AI level-estimation feature. Nothing
  // in Sprint 2 writes this value.
  AI_ESTIMATED: 'ai-estimated',
});

// Canonical vocabulary for `level.selectedLevel`. The future Level
// Selection stage renders its options from this same list so the
// persisted value and the UI copy can never drift apart.
export const LEARNING_LEVELS = Object.freeze([
  'Beginner',
  'Elementary',
  'Pre-Intermediate',
  'Intermediate',
  'Upper Intermediate',
  'Advanced',
]);

// Placeholder seed league until profile/leagues.js (Phase B) owns
// the real ladder + resolveLeague(xp). Kept here so a profile is
// always schema-valid even before that module exists.
export const DEFAULT_LEAGUE = 'Bronze';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoStringOrNull(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || !value) return false;
  return !Number.isNaN(Date.parse(value));
}

function isNonEmptyStringOrNull(value) {
  return value === null || (typeof value === 'string' && value.length > 0);
}

// ==================== DEFAULTS ====================

export function defaultLearningBrain() {
  return {
    version: LEARNING_BRAIN_VERSION,
    onboardingCompleted: false,
    onboardingCompletedAt: null,

    identity: {
      displayName: '',
      learningReason: null,
    },

    level: {
      selectedLevel: null,
      needsLevelAssessment: false,
      levelSource: null,
      cefrLevel: null,
      selectedAt: null,
    },

    plan: {
      targetGoal: null,
      dailyTimeGoalMinutes: null,
    },

    motivation: {
      tags: [],
      freeText: '',
    },

    gamification: {
      learningStreak: 0,
      currentXP: 0,
      currentLeague: DEFAULT_LEAGUE,
    },

    firstSession: {
      recommendedFirstLesson: null,
      firstPodcastId: null,
      firstMission: null,
    },

    sync: {
      syncPending: false,
      lastSyncedAt: null,
    },

    // Set by the local-persistence backfill path (db.js) for
    // pre-Sprint-2 users; never set by the builder.
    backfilled: false,
  };
}

// ==================== VALIDATION ====================

/**
 * Structural validator. Returns { valid, errors }. Never throws —
 * callers that need "reject invalid profiles" behavior should use
 * assertValidLearningBrain().
 */
export function validateLearningBrain(profile) {
  const errors = [];

  if (!isPlainObject(profile)) {
    return { valid: false, errors: ['profile must be a plain object'] };
  }

  if (!Number.isInteger(profile.version) || profile.version < 1 || profile.version > LEARNING_BRAIN_VERSION) {
    errors.push(`version must be an integer between 1 and ${LEARNING_BRAIN_VERSION}`);
  }

  if (typeof profile.onboardingCompleted !== 'boolean') {
    errors.push('onboardingCompleted must be a boolean');
  }
  if (!isIsoStringOrNull(profile.onboardingCompletedAt)) {
    errors.push('onboardingCompletedAt must be an ISO string or null');
  }

  if (!isPlainObject(profile.identity)) {
    errors.push('identity must be an object');
  } else {
    if (typeof profile.identity.displayName !== 'string') {
      errors.push('identity.displayName must be a string');
    }
    if (!isNonEmptyStringOrNull(profile.identity.learningReason)) {
      errors.push('identity.learningReason must be a non-empty string or null');
    }
  }

  if (!isPlainObject(profile.level)) {
    errors.push('level must be an object');
  } else {
    const { selectedLevel, needsLevelAssessment, levelSource, cefrLevel, selectedAt } = profile.level;

    if (selectedLevel !== null && !LEARNING_LEVELS.includes(selectedLevel)) {
      errors.push(`level.selectedLevel must be null or one of: ${LEARNING_LEVELS.join(', ')}`);
    }
    if (typeof needsLevelAssessment !== 'boolean') {
      errors.push('level.needsLevelAssessment must be a boolean');
    }
    if (levelSource !== null && !Object.values(LEVEL_SOURCES).includes(levelSource)) {
      errors.push('level.levelSource must be null or a known LEVEL_SOURCES value');
    }
    if (!isIsoStringOrNull(selectedAt)) {
      errors.push('level.selectedAt must be an ISO string or null');
    }

    // Structural invariant (Product decision, Phase A): self-selection
    // never produces a CEFR value. Only the reserved future AI path may.
    if (cefrLevel !== null && levelSource !== LEVEL_SOURCES.AI_ESTIMATED) {
      errors.push('level.cefrLevel must be null unless level.levelSource is "ai-estimated"');
    }

    // Mutual exclusivity: "I don't know my level" has no selectedLevel;
    // a self-reported level always has one.
    if (needsLevelAssessment === true && selectedLevel !== null) {
      errors.push('level.selectedLevel must be null when needsLevelAssessment is true');
    }
    if (needsLevelAssessment === false && levelSource === LEVEL_SOURCES.SELF_REPORTED && selectedLevel === null) {
      errors.push('level.selectedLevel is required when levelSource is "self-reported"');
    }
  }

  if (!isPlainObject(profile.plan)) {
    errors.push('plan must be an object');
  } else {
    if (!isNonEmptyStringOrNull(profile.plan.targetGoal)) {
      errors.push('plan.targetGoal must be a non-empty string or null');
    }
    if (profile.plan.dailyTimeGoalMinutes !== null && !(Number.isFinite(profile.plan.dailyTimeGoalMinutes) && profile.plan.dailyTimeGoalMinutes > 0)) {
      errors.push('plan.dailyTimeGoalMinutes must be a positive number or null');
    }
  }

  if (!isPlainObject(profile.motivation)) {
    errors.push('motivation must be an object');
  } else {
    if (!Array.isArray(profile.motivation.tags) || !profile.motivation.tags.every(tag => typeof tag === 'string')) {
      errors.push('motivation.tags must be an array of strings');
    }
    if (typeof profile.motivation.freeText !== 'string') {
      errors.push('motivation.freeText must be a string');
    }
  }

  if (!isPlainObject(profile.gamification)) {
    errors.push('gamification must be an object');
  } else {
    if (!Number.isFinite(profile.gamification.learningStreak) || profile.gamification.learningStreak < 0) {
      errors.push('gamification.learningStreak must be a non-negative number');
    }
    if (!Number.isFinite(profile.gamification.currentXP) || profile.gamification.currentXP < 0) {
      errors.push('gamification.currentXP must be a non-negative number');
    }
    if (typeof profile.gamification.currentLeague !== 'string' || !profile.gamification.currentLeague) {
      errors.push('gamification.currentLeague must be a non-empty string');
    }
  }

  if (!isPlainObject(profile.firstSession)) {
    errors.push('firstSession must be an object');
  } else {
    const { recommendedFirstLesson, firstPodcastId, firstMission } = profile.firstSession;
    if (recommendedFirstLesson !== null && !isPlainObject(recommendedFirstLesson)) {
      errors.push('firstSession.recommendedFirstLesson must be an object or null');
    }
    if (!isNonEmptyStringOrNull(firstPodcastId)) {
      errors.push('firstSession.firstPodcastId must be a non-empty string or null');
    }
    if (firstMission !== null && !isPlainObject(firstMission)) {
      errors.push('firstSession.firstMission must be an object or null');
    }
  }

  if (!isPlainObject(profile.sync)) {
    errors.push('sync must be an object');
  } else {
    if (typeof profile.sync.syncPending !== 'boolean') {
      errors.push('sync.syncPending must be a boolean');
    }
    if (!isIsoStringOrNull(profile.sync.lastSyncedAt)) {
      errors.push('sync.lastSyncedAt must be an ISO string or null');
    }
  }

  if (typeof profile.backfilled !== 'boolean') {
    errors.push('backfilled must be a boolean');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Throws with a descriptive message when the profile is invalid.
 * Use at integration boundaries (builder output, load-from-storage)
 * where an invalid profile must never propagate silently.
 */
export function assertValidLearningBrain(profile) {
  const { valid, errors } = validateLearningBrain(profile);
  if (!valid) {
    throw new Error(`Invalid LearningBrainProfile: ${errors.join('; ')}`);
  }
  return profile;
}

// ==================== MIGRATION ====================

function deepMergeDefaults(defaults, partial) {
  if (!isPlainObject(partial)) return defaults;
  const merged = Array.isArray(defaults) ? [...defaults] : { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (!(key in partial)) continue;
    const defaultValue = defaults[key];
    const partialValue = partial[key];
    if (isPlainObject(defaultValue) && isPlainObject(partialValue)) {
      merged[key] = deepMergeDefaults(defaultValue, partialValue);
    } else if (partialValue !== undefined) {
      merged[key] = partialValue;
    }
  }
  return merged;
}

/**
 * Upgrades a raw, possibly partial or older-version profile object
 * into a valid current-version LearningBrainProfile, or returns null
 * if it cannot be recovered (unknown/future version, or still invalid
 * after merging onto defaults).
 *
 * Sprint 2 ships only v1, so this is an identity + shape-completion
 * pass. Future version bumps add per-version transform steps here
 * without changing any caller.
 */
export function migrateLearningBrain(raw) {
  if (!isPlainObject(raw)) return null;

  const rawVersion = Number(raw.version);
  if (!Number.isInteger(rawVersion) || rawVersion < 1) return null;
  if (rawVersion > LEARNING_BRAIN_VERSION) return null; // unsupported future version

  const completed = deepMergeDefaults(defaultLearningBrain(), raw);
  completed.version = LEARNING_BRAIN_VERSION;

  const { valid } = validateLearningBrain(completed);
  return valid ? completed : null;
}
