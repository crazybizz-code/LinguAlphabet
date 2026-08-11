import { describe, it, expect } from "vitest";
import { isMockDue, extractMockPolicy } from "./frequency";
import type { MockFrequencyPolicy } from "@/lib/assessment/types";

const B2_POLICY: MockFrequencyPolicy = {
  minDaysBetweenMocks: 7,
  maxDaysBetweenMocks: 7,
  fastTrackThreshold: 4,
};

const C1_POLICY: MockFrequencyPolicy = {
  minDaysBetweenMocks: 3,
  maxDaysBetweenMocks: 3,
  fastTrackThreshold: 4,
};

describe("isMockDue", () => {
  it("is due immediately when never taken", () => {
    const result = isMockDue(null, B2_POLICY);
    expect(result.isDue).toBe(true);
    expect(result.lastMockDate).toBeNull();
    expect(result.daysSinceLastMock).toBeNull();
  });

  it("is not due on the same day for B2 policy", () => {
    const today = new Date();
    const result = isMockDue(today.toISOString(), B2_POLICY, today);
    expect(result.isDue).toBe(false);
    expect(result.daysSinceLastMock).toBe(0);
  });

  it("is due after 7 days for B2 policy", () => {
    const ref = new Date("2026-08-11");
    const last = new Date("2026-08-04"); // 7 days ago
    const result = isMockDue(last.toISOString(), B2_POLICY, ref);
    expect(result.isDue).toBe(true);
    expect(result.daysSinceLastMock).toBe(7);
  });

  it("is not due after 6 days for B2 policy", () => {
    const ref = new Date("2026-08-11");
    const last = new Date("2026-08-05"); // 6 days ago
    const result = isMockDue(last.toISOString(), B2_POLICY, ref);
    expect(result.isDue).toBe(false);
    expect(result.daysSinceLastMock).toBe(6);
  });

  it("is due after 3 days for C1+ policy", () => {
    const ref = new Date("2026-08-11");
    const last = new Date("2026-08-08"); // 3 days ago
    const result = isMockDue(last.toISOString(), C1_POLICY, ref);
    expect(result.isDue).toBe(true);
  });

  it("is not due after 2 days for C1+ policy", () => {
    const ref = new Date("2026-08-11");
    const last = new Date("2026-08-09"); // 2 days ago
    const result = isMockDue(last.toISOString(), C1_POLICY, ref);
    expect(result.isDue).toBe(false);
  });

  it("attaches the policy to the result", () => {
    const result = isMockDue(null, C1_POLICY);
    expect(result.policy).toEqual(C1_POLICY);
  });
});

describe("extractMockPolicy", () => {
  it("returns DEFAULT_MOCK_POLICY for null input", () => {
    const policy = extractMockPolicy(null);
    expect(policy.minDaysBetweenMocks).toBe(3);
    expect(policy.fastTrackThreshold).toBe(4);
  });

  it("returns DEFAULT_MOCK_POLICY for non-object input", () => {
    const policy = extractMockPolicy("string");
    expect(policy.minDaysBetweenMocks).toBe(3);
  });

  it("extracts valid numeric fields from plan_config object", () => {
    const config = { minDaysBetweenMocks: 7, maxDaysBetweenMocks: 7, fastTrackThreshold: 4 };
    const policy = extractMockPolicy(config);
    expect(policy.minDaysBetweenMocks).toBe(7);
    expect(policy.maxDaysBetweenMocks).toBe(7);
    expect(policy.fastTrackThreshold).toBe(4);
  });

  it("falls back to defaults for missing fields", () => {
    const policy = extractMockPolicy({ minDaysBetweenMocks: 5 });
    expect(policy.minDaysBetweenMocks).toBe(5);
    expect(policy.maxDaysBetweenMocks).toBe(7); // default
    expect(policy.fastTrackThreshold).toBe(4);  // default
  });
});
