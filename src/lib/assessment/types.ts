import type { AssessmentSkill, QuestionResponse } from "@/types/assessment";

/** Ability state tracked per skill during an adaptive session. */
export interface SkillState {
  skill: AssessmentSkill;
  abilityIndex: number; // 0–5, can be fractional
  responses: QuestionResponse[];
}

export interface AdaptiveState {
  attemptId: string;
  reading: SkillState;
  listening: SkillState;
  totalAnswered: number;
}

/** Configurable policy governing mock frequency and plan structure. */
export interface MockFrequencyPolicy {
  /** Minimum days between full mocks (B2 baseline). */
  minDaysBetweenMocks: number;
  /** Maximum days between full mocks (C1+ fast track). */
  maxDaysBetweenMocks: number;
  /** Ability index threshold above which we shift toward the faster cadence. */
  fastTrackThreshold: number;
}

export const DEFAULT_MOCK_POLICY: MockFrequencyPolicy = {
  minDaysBetweenMocks: 3,
  maxDaysBetweenMocks: 7,
  fastTrackThreshold: 4, // C1 = index 4
};
