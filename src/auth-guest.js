// ============================================================
// auth-guest.js — Guest usage metering infrastructure.
//
// A generic "track usage against a named limit, then prompt to upgrade"
// engine for Guest accounts. This module intentionally knows nothing about
// any specific feature limit (AI minutes, lesson counts, etc.) — callers
// configure the key/limit/period when a future phase wires an actual
// feature gate. Persists through the existing UserState (db.js), the same
// store every other guest field already uses — no second storage mechanism.
// ============================================================
import { UserState } from './db.js';

function readUsageMap() {
  if (!UserState._data) UserState.load();
  return UserState._data.guestUsage || {};
}

function writeUsageMap(map) {
  UserState.update({ guestUsage: map });
}

// Increments a named usage counter. `periodMs`, when provided, auto-resets
// the counter once that much time has passed since it was first touched
// (e.g. a rolling daily limit) — the caller decides what "period" means for
// their feature; nothing is assumed here.
export function recordGuestUsage(key, amount = 1, { periodMs } = {}) {
  const map = readUsageMap();
  const now = Date.now();
  const entry = map[key];

  if (!entry || (periodMs && now - entry.since >= periodMs)) {
    map[key] = { count: amount, since: now };
  } else {
    map[key] = { count: entry.count + amount, since: entry.since };
  }

  writeUsageMap(map);
  return map[key].count;
}

export function getGuestUsage(key) {
  const entry = readUsageMap()[key];
  return entry ? entry.count : 0;
}

export function isGuestLimitReached(key, limit) {
  if (!Number.isFinite(limit)) return false;
  return getGuestUsage(key) >= limit;
}

export function resetGuestUsage(key) {
  const map = readUsageMap();
  delete map[key];
  writeUsageMap(map);
}

// ==================== UPGRADE PROMPT HOOK ====================
// Mirrors auth-ui.js's setAuthPanelHook pattern: this module doesn't know
// how the app opens its upgrade UI (main.js owns the existing #upgrade-
// overlay modal), it just calls whatever main.js registers here.
let upgradeHook = null;

export function setGuestUpgradeHook(fn) {
  upgradeHook = fn;
}

// Call when a guest hits a limit you've configured. `reason` is optional,
// caller-supplied context displayed in the existing upgrade overlay.
export function requestGuestUpgrade(reason) {
  upgradeHook?.(reason);
}
