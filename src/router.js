// ============================================================
// router.js — Screen mount/unmount + transition orchestration
//
// The only thing allowed to mount or unmount a screen. Screens never
// reach into each other directly — this replaces V1's four
// inconsistent ad hoc ways of "swap what's visible"
// (navigateTo/showOnboardingStep/showAuth/showMainApp).
//
// Screen module contract:
//   mount(container: HTMLElement, params?: object) -> {
//     unmount?(): void,
//     update?(patch: object): void
//   }
// ============================================================

import { crossFade } from './animation.js';

let mountEl = null;
const stack = [];

export function initRouter(container) {
  mountEl = container;
}

function createSlot() {
  const el = document.createElement('div');
  el.className = 'ds-screen-slot';
  return el;
}

// Mounts `entry` into the DOM, cross-fades it in against
// `previousEntry`, then always detaches the previous element (an
// invisible-but-still-interactive layer left in the DOM is a bug, not
// a feature) — and unmounts its instance unless `discardPrevious` is
// false, in which case it's kept alive off-screen for `back()`.
async function present(entry, previousEntry, { transition = crossFade, discardPrevious = true } = {}) {
  if (!mountEl) {
    throw new Error('Router not initialized — call initRouter(container) first.');
  }

  mountEl.appendChild(entry.el);
  await transition({ outgoing: previousEntry?.el || null, incoming: entry.el });

  if (previousEntry) {
    previousEntry.el.remove();
    if (discardPrevious) previousEntry.instance?.unmount?.();
  }
}

// Pushes a new screen onto the stack. The previous screen's instance
// is kept alive (off-DOM) so `back()` can resume it without
// re-running `mount()` — screen-local state survives a back navigation
// for free since it's the same instance, not a fresh one.
export async function navigate(screenModule, params = {}, options = {}) {
  const previous = stack[stack.length - 1] || null;
  const entry = { module: screenModule, el: createSlot() };
  entry.instance = screenModule.mount(entry.el, params) || {};

  await present(entry, previous, { ...options, discardPrevious: false });
  stack.push(entry);
  return entry.instance;
}

// Replaces the current screen with no way back to it (e.g. moving
// from auth into onboarding, or finishing onboarding into the app).
export async function replace(screenModule, params = {}, options = {}) {
  const previous = stack.pop() || null;
  const entry = { module: screenModule, el: createSlot() };
  entry.instance = screenModule.mount(entry.el, params) || {};

  await present(entry, previous, { ...options, discardPrevious: true });
  stack.push(entry);
  return entry.instance;
}

// Returns to the previous screen on the stack, if any, discarding the
// current one entirely.
export async function back(options = {}) {
  if (stack.length < 2) return null;
  const current = stack.pop();
  const previous = stack[stack.length - 1];
  const transition = options.transition || crossFade;

  mountEl.appendChild(previous.el);
  await transition({ outgoing: current.el, incoming: previous.el });

  current.el.remove();
  current.instance?.unmount?.();
  return previous.instance;
}

export function getCurrentScreen() {
  return stack[stack.length - 1] || null;
}
