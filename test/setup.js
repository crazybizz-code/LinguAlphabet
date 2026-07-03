// ============================================================
// test/setup.js — Vitest global setup
// ============================================================
// The app's pure/data modules (onboarding store, future services)
// are written against the browser localStorage API. Rather than
// pull in jsdom/happy-dom just for one Web Storage interface, this
// installs a minimal in-memory implementation for the node test
// environment. Tests that need isolation between cases call
// `localStorage.clear()` themselves (see store.test.js).

class MemoryStorage {
  constructor() {
    this._data = new Map();
  }

  getItem(key) {
    return this._data.has(key) ? this._data.get(key) : null;
  }

  setItem(key, value) {
    this._data.set(key, String(value));
  }

  removeItem(key) {
    this._data.delete(key);
  }

  clear() {
    this._data.clear();
  }

  key(index) {
    return Array.from(this._data.keys())[index] ?? null;
  }

  get length() {
    return this._data.size;
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new MemoryStorage();
}
