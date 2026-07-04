// ============================================================
// store.js — OnboardingStore
// ============================================================
// Holds in-progress onboarding answers and the current stage id,
// autosaved to localStorage as a versioned, user-scoped draft.
// This is the persistence primitive only — it does not know about
// stages, the registry, or how transitions happen (that is
// machine.js, a later phase).
//
// Draft key is v2 to avoid any collision with the Sprint 1 draft
// (`linguAlphabet_onboarding_draft`), which stays untouched and
// owned by the legacy engine per the approved coexistence strategy.

export const ONBOARDING_DRAFT_VERSION = 1;
export const ONBOARDING_DRAFT_STORAGE_KEY = 'linguAlphabet_onboarding_draft_v2';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStorage() {
  try {
    const raw = localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(draft) {
  try {
    localStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable/full — draft simply won't resume; onboarding
    // itself must not fail because of it.
  }
}

function removeStorage() {
  try {
    localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
  } catch {
    // no-op
  }
}

export function defaultDraft(userId = null) {
  return {
    version: ONBOARDING_DRAFT_VERSION,
    userId,
    stageId: null,
    answers: {},
    updatedAt: null,
  };
}

/**
 * Upgrades a raw stored draft into the current shape, or returns
 * null if it can't be recovered (missing/foreign/future version).
 * Sprint 2 ships only draft v1; future version bumps add transform
 * steps here without changing any caller.
 */
export function migrateDraft(raw) {
  if (!isPlainObject(raw)) return null;

  const rawVersion = Number(raw.version);
  if (!Number.isInteger(rawVersion) || rawVersion < 1) return null;
  if (rawVersion > ONBOARDING_DRAFT_VERSION) return null; // unsupported future version

  return {
    version: ONBOARDING_DRAFT_VERSION,
    userId: typeof raw.userId === 'string' ? raw.userId : null,
    stageId: typeof raw.stageId === 'string' ? raw.stageId : null,
    answers: isPlainObject(raw.answers) ? raw.answers : {},
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

/**
 * Factory so the store can be unit-tested (or, later, used for more
 * than one concurrent draft) without touching the shared singleton
 * below or global localStorage state.
 */
export function createOnboardingStore() {
  let draft = defaultDraft();

  /** Loads and user-scopes the persisted draft. Resume entry point. */
  function load(userId = null) {
    const raw = readStorage();
    const migrated = migrateDraft(raw);

    if (migrated && migrated.userId === userId) {
      draft = migrated;
    } else {
      // No draft, a foreign user's draft, or a corrupt/unsupported
      // one — either way, this identity starts clean, and a stale
      // draft on disk is discarded rather than left to confuse a
      // later load() for a different user.
      draft = defaultDraft(userId);
      if (raw) removeStorage();
    }

    return getDraft();
  }

  function save() {
    draft = { ...draft, updatedAt: new Date().toISOString() };
    writeStorage(draft);
    return getDraft();
  }

  function getDraft() {
    return { ...draft, answers: { ...draft.answers } };
  }

  function getAnswers() {
    return { ...draft.answers };
  }

  /** Shallow-merges `partial` into answers and autosaves. */
  function patchAnswers(partial) {
    if (!isPlainObject(partial)) return getAnswers();
    draft = { ...draft, answers: { ...draft.answers, ...partial } };
    save();
    return getAnswers();
  }

  function getStageId() {
    return draft.stageId;
  }

  /** Records the active stage and autosaves — the resume point. */
  function setStageId(stageId) {
    draft = { ...draft, stageId };
    save();
    return draft.stageId;
  }

  function hasResumableDraft(userId = null) {
    return draft.userId === userId && Boolean(draft.stageId);
  }

  function clear() {
    draft = defaultDraft(draft.userId);
    removeStorage();
  }

  return {
    load,
    save,
    getDraft,
    getAnswers,
    patchAnswers,
    getStageId,
    setStageId,
    hasResumableDraft,
    clear,
  };
}

// Shared instance for the app; stage modules and the (future) machine
// import this rather than constructing their own store.
export const onboardingStore = createOnboardingStore();
