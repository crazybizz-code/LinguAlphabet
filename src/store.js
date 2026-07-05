// ============================================================
// store.js — State management layer
//
// Two kinds of state, kept deliberately separate:
//
// 1. `contentStore` — read-only-from-the-UI content (podcasts,
//    transcripts, assessment questions). Populated at boot by
//    main.js, refreshed by lessons.js.
//
// 2. Persisted user state — stays modeled by `UserState` (db.js) as
//    the single source of truth (unchanged, per the V2 plan's "never
//    modify" list). This module adds a thin subscribe/notify layer on
//    top of it so screens can react to a specific field changing
//    instead of every mutation site needing to remember to call the
//    right render function by hand — the pattern that caused most of
//    V1's state/UI drift.
//
// Screen-local/ephemeral UI state (current step, selected answer,
// "is this mid-animation" flags) belongs in the screen module's own
// closure, not here.
// ============================================================

import { UserState } from './db.js';

export const contentStore = {
  podcasts: [],
  transcripts: {},
  assessmentQuestions: []
};

const listeners = new Map(); // key -> Set<callback>

function notify(key, value) {
  (listeners.get(key) || new Set()).forEach(cb => cb(value));
  (listeners.get('*') || new Set()).forEach(cb => cb(key, value));
}

// Subscribe to a specific UserState key (e.g. 'xp', 'streak'), or '*'
// for every change. Returns an unsubscribe function.
export function subscribe(key, callback) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(callback);
  return () => listeners.get(key)?.delete(callback);
}

export function getUserState(key) {
  return UserState.get(key);
}

export function setUserState(key, value) {
  UserState.set(key, value);
  notify(key, value);
}

export function updateUserState(patch) {
  UserState.update(patch);
  Object.entries(patch).forEach(([key, value]) => notify(key, value));
}
