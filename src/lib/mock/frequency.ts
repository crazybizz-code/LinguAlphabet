/**
 * Mock frequency policy — governs how often a full mock is due.
 *
 * The policy is stored in learning_plans.plan_config and defaults to
 * DEFAULT_MOCK_POLICY from assessment/types.ts. The adaptor reads the
 * active plan's config to determine if a mock is due today.
 */

import type { MockFrequencyPolicy } from "@/lib/assessment/types";
import { DEFAULT_MOCK_POLICY } from "@/lib/assessment/types";

export interface MockDueResult {
  isDue: boolean;
  /** ISO date of the last submitted mock attempt, or null. */
  lastMockDate: string | null;
  /** Days since last mock — null if never attempted. */
  daysSinceLastMock: number | null;
  /** The policy that produced this result. */
  policy: MockFrequencyPolicy;
}

/**
 * Determine if a full mock is due for the learner based on their active plan's
 * mock frequency policy and the date of their last completed mock.
 */
export function isMockDue(
  lastMockDate: string | null,
  policy: MockFrequencyPolicy = DEFAULT_MOCK_POLICY,
  referenceDate: Date = new Date(),
): MockDueResult {
  if (!lastMockDate) {
    // Never taken a mock — due immediately.
    return { isDue: true, lastMockDate: null, daysSinceLastMock: null, policy };
  }

  const last = new Date(lastMockDate);
  const diffMs = referenceDate.getTime() - last.getTime();
  const daysSince = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  // Use minDaysBetweenMocks as the threshold — the policy already collapses
  // min/max to the same value for B1/B2 (7) and C1+ (3).
  const isDue = daysSince >= policy.minDaysBetweenMocks;

  return { isDue, lastMockDate, daysSinceLastMock: daysSince, policy };
}

/**
 * Extract mock policy from a learning_plan's plan_config JSONB blob.
 * Falls back to DEFAULT_MOCK_POLICY if the config is missing or malformed.
 */
export function extractMockPolicy(planConfig: unknown): MockFrequencyPolicy {
  if (!planConfig || typeof planConfig !== "object") return DEFAULT_MOCK_POLICY;
  const c = planConfig as Record<string, unknown>;
  const min = typeof c.minDaysBetweenMocks === "number" ? c.minDaysBetweenMocks : DEFAULT_MOCK_POLICY.minDaysBetweenMocks;
  const max = typeof c.maxDaysBetweenMocks === "number" ? c.maxDaysBetweenMocks : DEFAULT_MOCK_POLICY.maxDaysBetweenMocks;
  const threshold = typeof c.fastTrackThreshold === "number" ? c.fastTrackThreshold : DEFAULT_MOCK_POLICY.fastTrackThreshold;
  return { minDaysBetweenMocks: min, maxDaysBetweenMocks: max, fastTrackThreshold: threshold };
}
