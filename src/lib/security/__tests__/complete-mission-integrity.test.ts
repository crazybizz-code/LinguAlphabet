/**
 * Pentest V-03 — completeMission is a Server Action, so its arguments are
 * attacker-controlled. XP must be derived from server-known facts and
 * written through the trusted client. Offline.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./fake-supabase";

const LEARNER = "learner-1";
const PODCAST_ID = "podcast-1";

let userClient: FakeSupabase & { auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };
let serviceClient: FakeSupabase;

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => userClient }));
vi.mock("@/lib/supabase/service-client", () => ({ createServiceClient: () => serviceClient }));
vi.mock("@/lib/content/queries", () => ({
  getPodcastById: async (_client: unknown, id: string) =>
    id === PODCAST_ID
      ? { id, contentType: "podcast", durationSeconds: 600, quiz: [{}, {}, {}, {}] }
      : null,
  getArticleById: async () => null,
}));
vi.mock("@/ai/data", () => ({ createSignalRepository: () => ({ record: async () => undefined }) }));
vi.mock("@/lib/analytics/record", () => ({ recordEvent: async () => undefined }));

const { completeMission } = await import("@/lib/learning-session/complete-mission");
const { computeXpEarned } = await import("@/lib/learning-session/xp");

function profileRow() {
  return { user_id: LEARNER, xp: 0, level: 1, xp_to_next: 300, streak: 0, longest_streak: 0, streak_shields: 0, last_study_date: null, total_minutes: 0 };
}

beforeEach(() => {
  userClient = Object.assign(new FakeSupabase(), {
    auth: { getUser: async () => ({ data: { user: { id: LEARNER } } }) },
  });
  userClient.seed("profiles", [profileRow()]);
  serviceClient = new FakeSupabase();
  serviceClient.seed("profiles", [profileRow()]);
});

describe("completeMission XP integrity", () => {
  it("clamps a forged correctAnswers to the content's real quiz and ignores client quiz/minutes", async () => {
    const result = await completeMission({
      contentId: PODCAST_ID,
      contentType: "podcast",
      estimatedMinutes: 100000,
      correctAnswers: 1_000_000_000,
      quizTotal: 1_000_000_000,
    });

    // Real quiz has 4 questions; casual (no mission row) completion.
    expect(result.xpEarned).toBe(computeXpEarned({ isMission: false, correctAnswers: 4 }));
    const progress = serviceClient.writes.find((w) => w.table === "progress")!.values as Record<string, unknown>;
    expect(progress).toMatchObject({ quiz_score: 4, quiz_total: 4, position_seconds: 600, user_id: LEARNER });
    expect(serviceClient.table("profiles")[0].total_minutes).toBe(10);
  });

  it("writes progression through the trusted client only, scoped to the caller", async () => {
    await completeMission({ contentId: PODCAST_ID, contentType: "podcast", correctAnswers: 2 });
    expect(userClient.writes.filter((w) => w.table === "profiles" || w.table === "progress")).toHaveLength(0);
    expect(serviceClient.table("profiles")[0].xp).toBeGreaterThan(0);
  });

  it("rejects completion of content that doesn't exist or isn't published", async () => {
    await expect(completeMission({ contentId: "made-up", contentType: "podcast", correctAnswers: 4 })).rejects.toThrow(/not found/i);
    expect(serviceClient.writes).toHaveLength(0);
  });

  it("rejects malformed input", async () => {
    await expect(completeMission({ contentId: PODCAST_ID, contentType: "podcast", correctAnswers: -5 })).rejects.toThrow(/invalid/i);
    await expect(completeMission({ contentId: PODCAST_ID, contentType: "podcast", correctAnswers: 1.5 })).rejects.toThrow(/invalid/i);
    expect(serviceClient.writes).toHaveLength(0);
  });

  it("surfaces a failed XP write instead of reporting success", async () => {
    serviceClient.failingWrites.add("profiles");
    await expect(completeMission({ contentId: PODCAST_ID, contentType: "podcast", correctAnswers: 1 })).rejects.toThrow(/award XP/);
  });
});
