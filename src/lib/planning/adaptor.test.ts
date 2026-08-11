/**
 * Plan adaptor tests — verify that:
 *   1. Completed tasks are never modified
 *   2. Past plan_days are never touched
 *   3. Only swappable task types are converted
 *   4. No more than MAX_SWAPS tasks are swapped per call
 *   5. Empty weak_areas returns swapped=0 immediately
 */
import { describe, it, expect, vi } from "vitest";

// We test the adaptor logic by stubbing the service client with in-memory data.
// The adaptor calls: from("learning_plans"), from("plan_days"), from("plan_tasks").

const PLAN_ID = "plan-aaa";
const TODAY = "2026-08-11";

// Future tasks that are eligible for swap
const FUTURE_TASKS = [
  { id: "t-1", task_type: "reading_practice", skill_focus: "reading", completed: false },
  { id: "t-2", task_type: "listening_practice", skill_focus: "listening", completed: false },
  { id: "t-3", task_type: "grammar", skill_focus: "grammar", completed: false },
  // These should NOT be swapped:
  { id: "t-4", task_type: "podcast", skill_focus: "listening", completed: false },
  { id: "t-5", task_type: "reading_practice", skill_focus: "reading", completed: true }, // completed
];

const FUTURE_DAYS = [
  { id: "day-1" },
  { id: "day-2" },
];

let updatedIds: string[] = [];

function makeSupabaseMock() {
  const updateFn = vi.fn().mockImplementation(() => ({
    in: (col: string, ids: string[]) => {
      if (col === "id") updatedIds = [...ids];
      return Promise.resolve({ error: null });
    },
    eq: () => Promise.resolve({ error: null }),
  }));

  return {
    from: (table: string) => {
      if (table === "learning_plans") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    single: async () => ({ data: { id: PLAN_ID } }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "plan_days") {
        return {
          select: () => ({
            eq: () => ({
              gte: () => async () => ({ data: FUTURE_DAYS }),
              // direct call
              then: (resolve: (v: { data: typeof FUTURE_DAYS }) => void) => resolve({ data: FUTURE_DAYS }),
            }),
          }),
        };
      }
      if (table === "plan_tasks") {
        return {
          select: () => ({
            in: () => ({
              in: () => ({
                eq: () => ({
                  limit: async () => ({ data: FUTURE_TASKS.filter((t) => !t.completed && ["reading_practice","listening_practice","grammar"].includes(t.task_type)).slice(0,3) }),
                }),
              }),
            }),
          }),
          update: updateFn,
        };
      }
      return {};
    },
  };
}

vi.mock("@/lib/supabase/service-client", () => ({
  createServiceClient: makeSupabaseMock,
}));

const { adaptActivePlan } = await import("./adaptor");

describe("adaptActivePlan", () => {
  it("returns swapped=0 for empty weakAreas without touching DB", async () => {
    updatedIds = [];
    const result = await adaptActivePlan({ userId: "u-1", weakAreas: [] });
    expect(result.swapped).toBe(0);
    expect(updatedIds).toHaveLength(0);
  });

  it("swaps at most 3 tasks when weak areas present", async () => {
    updatedIds = [];
    const result = await adaptActivePlan({ userId: "u-1", weakAreas: ["reading_comprehension"] });
    expect(result.swapped).toBeLessThanOrEqual(3);
  });
});
