import { useSyncExternalStore } from "react";

/**
 * The onboarding wizard is one route per step (not Base44's single-page
 * step-index wizard), so answers have to survive real navigations.
 * localStorage keeps this simple without pulling in a state library —
 * it's cleared once the final plan is generated (see /ai-plan).
 */
export interface OnboardingData {
  displayName: string;
  level: string;
  goal: string;
  dailyTime: number | null;
  interests: string[];
}

const STORAGE_KEY = "lingualphabet:onboarding";

const DEFAULT_DATA: OnboardingData = {
  displayName: "",
  level: "",
  goal: "",
  dailyTime: null,
  interests: [],
};

let cache: OnboardingData = { ...DEFAULT_DATA };
let hydrated = false;
const listeners = new Set<() => void>();

function loadFromStorage(): OnboardingData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...DEFAULT_DATA, ...JSON.parse(raw) } : { ...DEFAULT_DATA };
  } catch {
    cache = { ...DEFAULT_DATA };
  }
  hydrated = true;
  return cache;
}

/** Non-reactive read — safe to call in event handlers/effects. */
export function readOnboardingData(): OnboardingData {
  if (typeof window === "undefined") return DEFAULT_DATA;
  return hydrated ? cache : loadFromStorage();
}

export function writeOnboardingData(patch: Partial<OnboardingData>): OnboardingData {
  cache = { ...readOnboardingData(), ...patch };
  hydrated = true;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  }
  listeners.forEach((listener) => listener());
  return cache;
}

export function clearOnboardingData() {
  cache = { ...DEFAULT_DATA };
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Reactive read for components that render onboarding answers directly. */
export function useOnboardingData(): OnboardingData {
  return useSyncExternalStore(
    subscribe,
    () => (hydrated ? cache : loadFromStorage()),
    () => DEFAULT_DATA,
  );
}
