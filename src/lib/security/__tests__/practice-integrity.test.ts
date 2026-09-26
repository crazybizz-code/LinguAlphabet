/**
 * Pentest V-01/V-03 — practice completion may grade (and reveal answers
 * for) only the questions its own session served. Offline.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./fake-supabase";

let fake: FakeSupabase;
vi.mock("@/lib/supabase/service-client", () => ({ createServiceClient: () => fake }));

const { startPracticeSession, completePracticeSession } = await import("@/lib/practice/engine");

const LEARNER = "learner-1";
const MOCK_QUESTION = "mock-reading-q-live";

beforeEach(() => {
  fake = new FakeSupabase();
  for (let i = 0; i < 12; i++) {
    fake.seed("assessment_questions", [
      {
        id: `p-${i}`, skill: "reading", type: "mc", difficulty: "B1", passage: "p", passage_title: "t", audio_url: null,
        question: `Q${i}?`, options: ["right", "wrong"], correct_answer: "right", explanation: "why", approved: true, deprecated: false,
      },
    ]);
  }
  // A question from a learner's live mock exam — its id is known to the
  // browser, its answer must not be.
  fake.seed("assessment_questions", [
    { id: MOCK_QUESTION, skill: "reading", type: "mc", difficulty: "C1", question: "Mock?", correct_answer: "mock-secret", explanation: "mock-why", approved: true, deprecated: false },
  ]);
});

async function start() {
  const session = await startPracticeSession({ userId: LEARNER, practiceType: "reading", targetCefrLevel: "B1", questionCount: 5 });
  return { sessionId: session.sessionId, ids: session.questions.map((q) => q.id) };
}

const complete = (sessionId: string, responses: Array<{ questionId: string; userAnswer: string | null }>) =>
  completePracticeSession({ sessionId, userId: LEARNER, responses: responses.map((r) => ({ ...r, timeTakenSeconds: null })) });

describe("practice completion integrity", () => {
  it("records the served question set and never sends answers at start", async () => {
    const { sessionId, ids } = await start();
    const session = fake.table("practice_sessions").find((s) => s.id === sessionId)!;
    expect(session.question_ids).toEqual(ids);
    const started = await startPracticeSession({ userId: LEARNER, practiceType: "reading", targetCefrLevel: "B1", questionCount: 5 });
    expect(started.questions.every((q) => q.correctAnswer === "" && q.explanation === null)).toBe(true);
  });

  it("cannot be used to harvest another question's answer key", async () => {
    const { sessionId, ids } = await start();
    const error = await complete(sessionId, [...ids.slice(1), MOCK_QUESTION].map((questionId) => ({ questionId, userAnswer: "x" }))).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(JSON.stringify(error)).not.toContain("mock-secret");
    expect(fake.table("practice_responses")).toHaveLength(0);
  });

  it("rejects a hand-picked subset (which would inflate score_pct)", async () => {
    const { sessionId, ids } = await start();
    await expect(complete(sessionId, [{ questionId: ids[0], userAnswer: "right" }])).rejects.toThrow();
  });

  it("rejects a duplicated question", async () => {
    const { sessionId, ids } = await start();
    await expect(complete(sessionId, [...ids.slice(0, -1), ids[0]].map((questionId) => ({ questionId, userAnswer: "right" })))).rejects.toThrow();
  });

  it("rejects sessions created before question_ids existed", async () => {
    fake.seed("practice_sessions", [{ id: "legacy", user_id: LEARNER, status: "in_progress", practice_type: "reading", question_ids: null }]);
    await expect(complete("legacy", [{ questionId: "p-0", userAnswer: "right" }])).rejects.toThrow(/expired/);
  });

  it("legitimate completion grades on the server, over the full served set, once", async () => {
    const { sessionId, ids } = await start();
    const result = await complete(sessionId, ids.map((questionId, i) => ({ questionId, userAnswer: i < 3 ? "right" : null })));
    expect(result).toMatchObject({ questionCount: 5, correctCount: 3, scorePct: 60 });
    expect(result.results.every((r) => r.correctAnswer === "right")).toBe(true);

    await expect(complete(sessionId, ids.map((questionId) => ({ questionId, userAnswer: "right" })))).rejects.toThrow(/already completed/);
    expect(fake.table("learning_signals")).toHaveLength(1);
  });
});
