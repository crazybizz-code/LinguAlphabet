import { describe, it, expect, beforeEach } from 'vitest';
import {
  runInitialization,
  InitializationError,
  INITIALIZATION_STEPS,
} from './initialization.js';
import { validateLearningBrain, DEFAULT_LEAGUE } from '../profile/learningBrainProfile.js';
import { ONBOARDING_COMPLETION_XP_BONUS } from './gamificationSeed.js';
import { onboardingStore } from './store.js';
import { UserState } from '../db.js';

const CATALOG = [
  { podcastId: 'pod_beginner', title: 'Beginner Lesson', difficulty: 'Beginner' },
  { podcastId: 'pod_intermediate', title: 'Intermediate Lesson', difficulty: 'Intermediate' },
  { podcastId: 'pod_advanced', title: 'Advanced Lesson', difficulty: 'Advanced' },
];

const COMPLETE_ANSWERS = {
  targetGoal: 'General English',
  selectedLevel: 'Intermediate',
  needsLevelAssessment: false,
  dailyTimeGoalMinutes: 20,
  tags: ['Career'],
  freeText: 'I want a promotion',
};

function fakeStore(initialAnswers = {}) {
  let answers = { ...initialAnswers };
  let clearedCount = 0;
  return {
    getAnswers: () => ({ ...answers }),
    clear: () => { clearedCount += 1; answers = {}; },
    wasCleared: () => clearedCount > 0,
    clearCallCount: () => clearedCount,
  };
}

function fakeUserState(initialData = {}) {
  let data = { streak: 0, xp: 0, username: 'Learner', isGuest: true, userId: 'guest_test', ...initialData };
  const updateCalls = [];
  return {
    get: (key) => data[key],
    update: (patch) => { updateCalls.push(patch); data = { ...data, ...patch }; },
    snapshot: () => ({ ...data }),
    updateCalls,
  };
}

function baseOptions(overrides = {}) {
  return {
    store: fakeStore(COMPLETE_ANSWERS),
    userState: fakeUserState(),
    catalog: CATALOG,
    minStepDurationMs: 0,
    now: () => '2026-07-02T12:00:00.000Z',
    ...overrides,
  };
}

describe('runInitialization — happy path', () => {
  it('runs all 5 steps with the exact product-approved messages, in order', async () => {
    const events = [];
    await runInitialization({ ...baseOptions(), onProgress: (e) => events.push(e) });

    expect(events.map(e => e.message)).toEqual(INITIALIZATION_STEPS);
    expect(events.map(e => e.index)).toEqual([0, 1, 2, 3, 4]);
    expect(events.every(e => e.total === 5)).toBe(true);
  });

  it('produces a complete, schema-valid LearningBrainProfile', async () => {
    const profile = await runInitialization(baseOptions());
    const { valid, errors } = validateLearningBrain(profile);
    expect(valid, errors.join('; ')).toBe(true);
    expect(profile.onboardingCompleted).toBe(true);
    expect(profile.plan.targetGoal).toBe('General English');
    expect(profile.motivation.tags).toEqual(['Career']);
  });

  it('stores the level exactly as chosen, never a CEFR value', async () => {
    const profile = await runInitialization(baseOptions());
    expect(profile.level.selectedLevel).toBe('Intermediate');
    expect(profile.level.cefrLevel).toBeNull();
  });

  it('seeds gamification from the current UserState XP/streak plus the completion bonus', async () => {
    const userState = fakeUserState({ xp: 200, streak: 5 });
    const profile = await runInitialization(baseOptions({ userState }));
    expect(profile.gamification.currentXP).toBe(200 + ONBOARDING_COMPLETION_XP_BONUS);
    expect(profile.gamification.learningStreak).toBe(5);
    expect(profile.gamification.currentLeague).toBe(DEFAULT_LEAGUE);
  });

  it('resolves firstSession from the provided catalog based on the selected level', async () => {
    const profile = await runInitialization(baseOptions());
    expect(profile.firstSession.firstPodcastId).toBe('pod_intermediate');
    expect(profile.firstSession.firstMission).not.toBeNull();
  });

  it('commits to UserState exactly once (atomicity — no partial writes)', async () => {
    const userState = fakeUserState();
    await runInitialization(baseOptions({ userState }));
    expect(userState.updateCalls).toHaveLength(1);
  });

  it('the single commit carries the learningBrain plus the legacy mirror fields', async () => {
    const userState = fakeUserState();
    await runInitialization(baseOptions({ userState }));
    const patch = userState.updateCalls[0];
    expect(patch.learningBrain).toBeDefined();
    expect(patch.hasCompletedAssessment).toBe(true);
    expect(patch.targetGoal).toBe('General English');
    expect(patch.dailyTimeGoal).toBe(20);
  });

  it('clears the OnboardingStore draft only after a successful commit', async () => {
    const store = fakeStore(COMPLETE_ANSWERS);
    expect(store.wasCleared()).toBe(false);
    await runInitialization(baseOptions({ store }));
    expect(store.wasCleared()).toBe(true);
  });

  it('marks sync.syncPending true for a guest user and false for a registered user', async () => {
    const guestProfile = await runInitialization(baseOptions({ userState: fakeUserState({ isGuest: true }) }));
    expect(guestProfile.sync.syncPending).toBe(true);

    const registeredProfile = await runInitialization(
      baseOptions({ userState: fakeUserState({ isGuest: false, userId: 'user_123' }) }),
    );
    expect(registeredProfile.sync.syncPending).toBe(false);
  });

  it("treats 'I don't know my level' as complete and resolves a safe default first lesson", async () => {
    const store = fakeStore({ ...COMPLETE_ANSWERS, selectedLevel: null, needsLevelAssessment: true });
    const profile = await runInitialization(baseOptions({ store }));
    expect(profile.level).toMatchObject({ selectedLevel: null, needsLevelAssessment: true, cefrLevel: null });
    expect(profile.firstSession.firstPodcastId).toBe('pod_beginner');
  });
});

describe('runInitialization — error recovery', () => {
  it('fails fast with a clear, typed error when onboarding answers are incomplete', async () => {
    const store = fakeStore({ targetGoal: 'General English' }); // level/commitment/motivation missing
    const userState = fakeUserState();

    await expect(runInitialization(baseOptions({ store, userState }))).rejects.toThrow(InitializationError);

    try {
      await runInitialization(baseOptions({ store, userState }));
    } catch (error) {
      expect(error.step).toBe(INITIALIZATION_STEPS[0]);
    }
  });

  it('never writes to UserState when answers are incomplete', async () => {
    const store = fakeStore({});
    const userState = fakeUserState();
    await expect(runInitialization(baseOptions({ store, userState }))).rejects.toThrow();
    expect(userState.updateCalls).toHaveLength(0);
  });

  it('never clears the OnboardingStore when initialization fails', async () => {
    const store = fakeStore({});
    await expect(runInitialization(baseOptions({ store }))).rejects.toThrow();
    expect(store.wasCleared()).toBe(false);
  });

  it('preserves the original answers untouched after a failure, so a retry can reuse them', async () => {
    const store = fakeStore({});
    await expect(runInitialization(baseOptions({ store }))).rejects.toThrow();
    expect(store.getAnswers()).toEqual({});
  });

  it('surfaces a builder validation failure as InitializationError at the "Creating your learning profile..." step', async () => {
    // Passes the completeness check (non-empty tags array) but fails the
    // builder's own schema validation (tags must be strings) — a genuine
    // failure inside the Learning Brain Builder Integration itself.
    const store = fakeStore({ ...COMPLETE_ANSWERS, tags: [42] });
    const userState = fakeUserState();

    let caught;
    try {
      await runInitialization(baseOptions({ store, userState }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InitializationError);
    expect(caught.step).toBe(INITIALIZATION_STEPS[1]);
    expect(caught.cause).toBeDefined();
    expect(userState.updateCalls).toHaveLength(0);
    expect(store.wasCleared()).toBe(false);
  });

  it('surfaces a persistence failure as InitializationError at the "Personalizing your AI Coach..." step, without corrupting UserState', async () => {
    const store = fakeStore(COMPLETE_ANSWERS);
    const userState = fakeUserState();
    userState.update = () => { throw new Error('localStorage quota exceeded'); };

    let caught;
    try {
      await runInitialization(baseOptions({ store, userState }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InitializationError);
    expect(caught.step).toBe(INITIALIZATION_STEPS[4]);
    expect(store.wasCleared()).toBe(false);
  });

  it('does not double-wrap an InitializationError thrown from within a step', async () => {
    // Regression guard for the runStep try/catch: an InitializationError
    // escaping a step must propagate as-is, not get re-wrapped with a
    // generic "Initialization failed during ..." message that would hide
    // the original step attribution.
    const store = fakeStore({});
    try {
      await runInitialization(baseOptions({ store }));
    } catch (error) {
      expect(error.message).not.toMatch(/Initialization failed during "Initialization failed/);
    }
  });
});

describe('runInitialization — resume / retry (idempotent re-entry)', () => {
  it('a failed attempt can be retried immediately and succeeds once the missing answer is supplied', async () => {
    const store = fakeStore({ targetGoal: 'General English' }); // incomplete
    const userState = fakeUserState();

    await expect(runInitialization(baseOptions({ store, userState }))).rejects.toThrow(InitializationError);
    expect(userState.updateCalls).toHaveLength(0);

    // The user goes back and finishes the missing stage; its collect()
    // output would patch into the real store the same way this simulates.
    const completedStore = fakeStore(COMPLETE_ANSWERS);
    const profile = await runInitialization(baseOptions({ store: completedStore, userState }));

    expect(profile.onboardingCompleted).toBe(true);
    expect(userState.updateCalls).toHaveLength(1);
  });

  it('retrying after a transient persistence failure does not double-apply the onboarding XP bonus', async () => {
    const userState = fakeUserState({ xp: 100 });
    let shouldFail = true;
    const realUpdate = userState.update;
    userState.update = (patch) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('transient failure');
      }
      realUpdate(patch);
    };

    await expect(runInitialization(baseOptions({ store: fakeStore(COMPLETE_ANSWERS), userState }))).rejects.toThrow();

    const profile = await runInitialization(baseOptions({ store: fakeStore(COMPLETE_ANSWERS), userState }));
    // XP bonus computed from the still-unchanged base (100), not
    // re-applied on top of a phantom partial write from the failed try.
    expect(profile.gamification.currentXP).toBe(100 + ONBOARDING_COMPLETION_XP_BONUS);
  });

  it('a fresh run overwrites a pre-existing corrupt learningBrain value rather than merging with it', async () => {
    const userState = fakeUserState({ learningBrain: 'not-an-object-garbage' });
    const profile = await runInitialization(baseOptions({ store: fakeStore(COMPLETE_ANSWERS), userState }));

    expect(validateLearningBrain(profile).valid).toBe(true);
    expect(validateLearningBrain(userState.snapshot().learningBrain).valid).toBe(true);
  });

  it('re-running after success is independently safe (idempotent) and produces another valid profile', async () => {
    const userState = fakeUserState();
    const first = await runInitialization(baseOptions({ store: fakeStore(COMPLETE_ANSWERS), userState }));
    const second = await runInitialization(baseOptions({ store: fakeStore(COMPLETE_ANSWERS), userState }));

    expect(validateLearningBrain(first).valid).toBe(true);
    expect(validateLearningBrain(second).valid).toBe(true);
  });
});

describe('runInitialization — integration with the real singletons (default wiring)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('works end-to-end against the real onboardingStore and UserState, with no overrides beyond speed/catalog', async () => {
    UserState.load();
    UserState.update({ userId: 'guest_integration_test', isGuest: true, username: 'IntegrationTester' });

    onboardingStore.load('guest_integration_test');
    onboardingStore.patchAnswers(COMPLETE_ANSWERS);
    onboardingStore.setStageId('motivation');

    const profile = await runInitialization({ catalog: CATALOG, minStepDurationMs: 0 });

    expect(profile.onboardingCompleted).toBe(true);
    expect(UserState.get('learningBrain')).toEqual(profile);
    expect(UserState.get('hasCompletedAssessment')).toBe(true);
    expect(onboardingStore.getStageId()).toBeNull();
  });
});
