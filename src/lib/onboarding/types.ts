/**
 * IELTS onboarding — data model and step definitions.
 *
 * Kept free of React and of any presentational concern so the wizard's
 * rules (which steps exist, what makes each one answerable, when the
 * target-band warning fires) can be unit-tested without rendering
 * anything, and so a screen can never quietly invent its own validation.
 */

import { bandToAbilityIndex, CEFR_LEVELS } from "@/lib/assessment/adaptive";

/** Every exam shown on the selection grid. Only IELTS Academic is selectable today. */
export type ExamType = "IELTS Academic" | "IELTS General" | "TOEFL iBT" | "Cambridge English" | "PTE Academic";

export const SELECTABLE_EXAM: ExamType = "IELTS Academic";

/** Band scores are half-point steps; modelled as numbers so comparisons are real arithmetic, not string ordering. */
export type BandScore = number;

export type ExamTimeline =
  | "Within 2 weeks"
  | "Within 1 month"
  | "Within 3 months"
  | "More than 3 months"
  | "I haven't booked it yet";

/** Minutes per day. */
export type DailyStudyTime = 15 | 30 | 45 | 60;

export interface OnboardingData {
  displayName: string;
  examType: ExamType;
  /**
   * Null means either "not answered yet" or the learner explicitly chose
   * "Not sure". Those are distinguished by `currentBandUnsure` rather than
   * by overloading this field, because "I don't know my band" is a real,
   * savable answer while "unanswered" must still block Continue.
   */
  currentBand: BandScore | null;
  currentBandUnsure: boolean;
  targetBand: BandScore | null;
  examTimeline: ExamTimeline | "";
  dailyTime: DailyStudyTime | null;
}

export const ONBOARDING_STEPS = [
  "name",
  "exam",
  "currentBand",
  "targetBand",
  "examDate",
  "dailyTime",
  "placement",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const TOTAL_STEPS = ONBOARDING_STEPS.length;

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  displayName: "",
  examType: SELECTABLE_EXAM,
  currentBand: null,
  currentBandUnsure: false,
  targetBand: null,
  examTimeline: "",
  dailyTime: null,
};

/**
 * True when the learner has asked for a target at or below where they
 * already are. Surfaced as an inline warning rather than a hard block on
 * selection, so they can see the message and correct it in place instead
 * of being unable to press a button with no explanation.
 *
 * Deliberately false while "Not sure" is selected: with no known starting
 * band there is nothing to compare against, and warning anyway would be
 * inventing a problem.
 */
export function isTargetBandTooLow(data: OnboardingData): boolean {
  if (data.currentBandUnsure) return false;
  if (data.currentBand === null || data.targetBand === null) return false;
  return data.targetBand < data.currentBand;
}

/**
 * IELTS band -> CEFR level, using the published band/CEFR alignment.
 *
 * Needed because the rest of LinguABC (the plan screen, the Learning
 * Brain, content CEFR ranges) speaks CEFR, while this flow collects
 * bands. Delegates to the same band/CEFR alignment the real placement
 * engine uses (src/lib/assessment/adaptive.ts) rather than maintaining a
 * second, independently-tuned threshold table here — the two had drifted
 * apart (e.g. a self-reported 4.0 was landing on B1 here but A2 there).
 *
 * Returns null for an unknown band — "Not sure" genuinely means we do not
 * know their level yet, and the placement assessment is what resolves it.
 * Guessing a default would put a fabricated level on their profile.
 */
export function bandToCefr(band: BandScore | null): string | null {
  if (band === null) return null;
  return CEFR_LEVELS[bandToAbilityIndex(band)];
}

/** Whether the current step has been answered well enough to advance. */
export function canAdvance(step: OnboardingStep, data: OnboardingData): boolean {
  switch (step) {
    case "name":
      return data.displayName.trim().length > 0;
    case "exam":
      return data.examType === SELECTABLE_EXAM;
    case "currentBand":
      return data.currentBandUnsure || data.currentBand !== null;
    case "targetBand":
      return data.targetBand !== null && !isTargetBandTooLow(data);
    case "examDate":
      return data.examTimeline.length > 0;
    case "dailyTime":
      return data.dailyTime !== null;
    case "placement":
      return true;
  }
}
