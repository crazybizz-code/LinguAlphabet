import { describe, it, expect, beforeEach } from 'vitest';
import {
  createOnboardingStore,
  defaultDraft,
  migrateDraft,
  onboardingStore,
  ONBOARDING_DRAFT_VERSION,
  ONBOARDING_DRAFT_STORAGE_KEY,
} from './store.js';

beforeEach(() => {
  localStorage.clear();
});

describe('defaultDraft', () => {
  it('is empty and unscoped by default', () => {
    expect(defaultDraft()).toEqual({
      version: ONBOARDING_DRAFT_VERSION,
      userId: null,
      stageId: null,
      answers: {},
      updatedAt: null,
    });
  });

  it('scopes to the given userId', () => {
    expect(defaultDraft('user_1').userId).toBe('user_1');
  });
});

describe('migrateDraft', () => {
  it('rejects non-object input', () => {
    expect(migrateDraft(null)).toBeNull();
    expect(migrateDraft('draft')).toBeNull();
  });

  it('rejects a missing, non-numeric, or non-positive version', () => {
    expect(migrateDraft({})).toBeNull();
    expect(migrateDraft({ version: 'not-a-number' })).toBeNull();
    expect(migrateDraft({ version: 0 })).toBeNull();
  });

  it('rejects a version newer than this client supports', () => {
    expect(migrateDraft({ version: ONBOARDING_DRAFT_VERSION + 1 })).toBeNull();
  });

  it('coerces malformed nested fields to safe defaults', () => {
    const migrated = migrateDraft({ version: 1, answers: 'not an object', stageId: 42, userId: 7 });
    expect(migrated).toEqual({
      version: ONBOARDING_DRAFT_VERSION,
      userId: null,
      stageId: null,
      answers: {},
      updatedAt: null,
    });
  });

  it('preserves valid fields as-is', () => {
    const migrated = migrateDraft({
      version: 1,
      userId: 'user_1',
      stageId: 'reason',
      answers: { identity: { displayName: 'Yodgor' } },
      updatedAt: '2026-07-02T00:00:00.000Z',
    });
    expect(migrated.userId).toBe('user_1');
    expect(migrated.stageId).toBe('reason');
    expect(migrated.answers).toEqual({ identity: { displayName: 'Yodgor' } });
  });
});

describe('createOnboardingStore', () => {
  it('load() with no prior draft returns a default draft scoped to the given user', () => {
    const store = createOnboardingStore();
    const draft = store.load('user_1');
    expect(draft.userId).toBe('user_1');
    expect(draft.stageId).toBeNull();
    expect(draft.answers).toEqual({});
  });

  it('patchAnswers merges into existing answers and autosaves', () => {
    const store = createOnboardingStore();
    store.load('user_1');
    store.patchAnswers({ identity: { displayName: 'Yodgor' } });
    store.patchAnswers({ plan: { targetGoal: 'General English' } });

    expect(store.getAnswers()).toEqual({
      identity: { displayName: 'Yodgor' },
      plan: { targetGoal: 'General English' },
    });

    const raw = JSON.parse(localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY));
    expect(raw.answers).toEqual(store.getAnswers());
  });

  it('setStageId updates the resume point and autosaves', () => {
    const store = createOnboardingStore();
    store.load('user_1');
    store.setStageId('reason');
    expect(store.getStageId()).toBe('reason');

    const raw = JSON.parse(localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY));
    expect(raw.stageId).toBe('reason');
  });

  it('a second store instance resumes the same user\'s in-progress draft', () => {
    const first = createOnboardingStore();
    first.load('user_1');
    first.patchAnswers({ identity: { displayName: 'Yodgor' } });
    first.setStageId('reason');

    const second = createOnboardingStore();
    const resumed = second.load('user_1');
    expect(resumed.stageId).toBe('reason');
    expect(resumed.answers).toEqual({ identity: { displayName: 'Yodgor' } });
    expect(second.hasResumableDraft('user_1')).toBe(true);
  });

  it('loading a different user does not leak the previous user\'s draft, and clears it from storage', () => {
    const first = createOnboardingStore();
    first.load('user_1');
    first.setStageId('reason');
    expect(localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY)).not.toBeNull();

    const second = createOnboardingStore();
    const draft = second.load('user_2');
    expect(draft.stageId).toBeNull();
    expect(draft.answers).toEqual({});
    expect(second.hasResumableDraft('user_1')).toBe(false);
    expect(localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('hasResumableDraft is false when no stage has been reached yet', () => {
    const store = createOnboardingStore();
    store.load('user_1');
    expect(store.hasResumableDraft('user_1')).toBe(false);
  });

  it('clear() resets in-memory state and removes the persisted draft', () => {
    const store = createOnboardingStore();
    store.load('user_1');
    store.setStageId('reason');
    store.clear();

    expect(store.getStageId()).toBeNull();
    expect(localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY)).toBeNull();

    const reloaded = createOnboardingStore();
    reloaded.load('user_1');
    expect(reloaded.getStageId()).toBeNull();
  });

  it('getDraft() and getAnswers() return copies, not live references', () => {
    const store = createOnboardingStore();
    store.load('user_1');
    store.patchAnswers({ identity: { displayName: 'Yodgor' } });

    const answers = store.getAnswers();
    answers.identity = { displayName: 'Tampered' };
    expect(store.getAnswers().identity.displayName).toBe('Yodgor');

    const draft = store.getDraft();
    draft.stageId = 'tampered';
    expect(store.getStageId()).not.toBe('tampered');
  });

  it('patchAnswers ignores non-object input without throwing', () => {
    const store = createOnboardingStore();
    store.load('user_1');
    store.patchAnswers({ identity: { displayName: 'Yodgor' } });
    expect(() => store.patchAnswers(null)).not.toThrow();
    expect(store.getAnswers()).toEqual({ identity: { displayName: 'Yodgor' } });
  });
});

describe('onboardingStore (shared singleton)', () => {
  it('is usable directly without constructing a new store', () => {
    onboardingStore.load('singleton_user');
    onboardingStore.setStageId('welcome');
    expect(onboardingStore.getStageId()).toBe('welcome');
    onboardingStore.clear();
  });
});
