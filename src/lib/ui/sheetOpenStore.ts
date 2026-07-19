/**
 * A minimal shared "is any bottom sheet currently open" signal — not app
 * state, not persisted, just a plain module-level counter with a tiny
 * pub-sub. Exists so unrelated fixed-position UI (the floating Ask Tuto
 * button) can react without EditSheet and FloatingTuto needing to know
 * about each other directly. A counter rather than a boolean supports the
 * (unlikely but possible) case of two sheets mounted at once without one's
 * close prematurely flipping the signal off for the other.
 *
 * Read via useSyncExternalStore, the same pattern already used elsewhere
 * in this app for external, non-React-state values (HomeView's greeting,
 * TodaysMissionCard's countdown).
 */
let openCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function markSheetOpen(): void {
  openCount += 1;
  emit();
}

export function markSheetClosed(): void {
  openCount = Math.max(0, openCount - 1);
  emit();
}

export function subscribeSheetOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getIsAnySheetOpen(): boolean {
  return openCount > 0;
}
