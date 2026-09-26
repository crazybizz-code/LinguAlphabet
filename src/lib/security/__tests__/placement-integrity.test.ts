/**
 * Pentest V-01/V-02 — application-layer placement integrity.
 * Offline: the service-role client is replaced by an in-memory fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./fake-supabase";

let fake: FakeSupabase;
vi.mock("@/lib/supabase/service-client", () => ({ createServiceClient: () => fake }));

const { startAssessment, recordAnswer, finaliseAssessment, stripAnswer, PlacementFlowError } = await import("@/lib/assessment/engine");

const LEARNER = "learner-1";
const OTHER = "learner-2";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

function seedQuestionBank(db: FakeSupabase) {
  let n = 0;
  for (const skill of ["reading", "listening"] as const) {
    for (const difficulty of LEVELS) {
      for (let i = 0; i < 6; i++) {
        n += 1;
        db.seed("assessment_questions", [
          {
            id: `q-${skill}-${difficulty}-${i}`,
            skill,
            type: "mc",
            difficulty,
            passage: `${skill} passage ${n}`,
            passage_title: "Title",
            audio_url: null,
            question: `Question ${n}?`,
            options: ["right", "wrong", "other", "none"],
            correct_answer: "right",
            explanation: "secret explanation",
            approved: true,
            deprecated: false,
          },
        ]);
      }
    }
  }
}

function installFinalizeRpc(db: FakeSupabase) {
  // Mirrors public.finalize_placement_attempt (supabase/security-remediation-2026-09.sql).
  db.rpcHandlers.finalize_placement_attempt = (args) => {
    const attempt = db.table("placement_attempts").find(
      (a) => a.id === args.p_attempt_id && a.user_id === args.p_user_id && a.status === "in_progress",
    );
    if (!attempt) return { data: false, error: null };
    const result = args.p_result as Record<string, unknown>;
    Object.assign(attempt, { status: "completed", pending_question_id: null, estimated_band: result.estimated_band });
    const profile = db.table("profiles").find((p) => p.user_id === args.p_user_id);
    if (profile) Object.assign(profile, { placement_completed: true, assessed_band: result.estimated_band });
    return { data: true, error: null };
  };
}

const answerFor = (attemptId: string, questionId: string, userAnswer = "right", userId = LEARNER) =>
  recordAnswer({ attemptId, userId, questionId, userAnswer, timeTakenSeconds: 5, currentBand: null, englishLevel: "B1" });

async function runToCompletion(attemptId: string, firstQuestionId: string) {
  let questionId = firstQuestionId;
  for (let i = 0; i < 60; i++) {
    const step = await answerFor(attemptId, questionId);
    if (step.done) return step;
    questionId = step.nextQuestion.id;
  }
  throw new Error("placement never finished");
}

beforeEach(() => {
  fake = new FakeSupabase();
  seedQuestionBank(fake);
  installFinalizeRpc(fake);
  fake.seed("profiles", [{ user_id: LEARNER, placement_completed: false }, { user_id: OTHER, placement_completed: false }]);
});

describe("V-01: questions served to the client carry no answer data", () => {
  it("start and every subsequent question are stripped", async () => {
    const start = await startAssessment(LEARNER, null, "B1");
    expect(start.firstQuestion.correctAnswer).toBe("");
    expect(start.firstQuestion.explanation).toBeNull();

    const step = await answerFor(start.attemptId, start.firstQuestion.id);
    if (step.done) throw new Error("unexpected finish");
    expect(step.nextQuestion.correctAnswer).toBe("");
    expect(step.nextQuestion.explanation).toBeNull();
    expect(JSON.stringify(step)).not.toContain("secret explanation");
  });

  it("hides a listening transcript whenever real audio exists", () => {
    const base = {
      id: "q", skill: "listening" as const, type: "mc" as const, difficulty: "B1" as const, passage: "transcript", passageTitle: "t",
      question: "?", options: ["a"], correctAnswer: "a", explanation: "e", sectionInstruction: null, questionInstruction: null, audioInstruction: null,
    };
    expect(stripAnswer({ ...base, audioUrl: "https://audio" }).passage).toBeNull();
    // No audio: the transcript is the only content, shown as a reading stand-in.
    expect(stripAnswer({ ...base, audioUrl: null }).passage).toBe("transcript");
  });
});

describe("V-02: the client cannot steer or forge the placement result", () => {
  it("binds the attempt to the question the server served", async () => {
    const start = await startAssessment(LEARNER, null, "B1");
    const [attempt] = fake.table("placement_attempts");
    expect(attempt.pending_question_id).toBe(start.firstQuestion.id);
  });

  it("rejects an answer to a question the server did not serve (e.g. a C2 item seen in Practice)", async () => {
    const start = await startAssessment(LEARNER, null, "B1");
    const chosen = "q-reading-C2-0";
    expect(chosen).not.toBe(start.firstQuestion.id);
    await expect(answerFor(start.attemptId, chosen)).rejects.toMatchObject({ status: 409 });
    expect(fake.table("placement_responses")).toHaveLength(0);
  });

  it("rejects answers to another learner's attempt without confirming it exists", async () => {
    const start = await startAssessment(OTHER, null, "B1");
    const error = await answerFor(start.attemptId, start.firstQuestion.id, "right", LEARNER).catch((e) => e);
    expect(error).toBeInstanceOf(PlacementFlowError);
    expect(error.status).toBe(404);
    expect(fake.table("placement_responses")).toHaveLength(0);
  });

  it("grades on the server and records a replayed answer only once", async () => {
    const start = await startAssessment(LEARNER, null, "B1");
    const first = await answerFor(start.attemptId, start.firstQuestion.id, "wrong");
    const replay = await answerFor(start.attemptId, start.firstQuestion.id, "right");

    const responses = fake.table("placement_responses");
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ question_id: start.firstQuestion.id, is_correct: false });
    // The replay resumes at the same next question rather than re-grading.
    if (first.done || replay.done) throw new Error("unexpected finish");
    expect(replay.nextQuestion.id).toBe(first.nextQuestion.id);
  });

  it("refuses to finalise before the server's own flow has finished", async () => {
    const start = await startAssessment(LEARNER, null, "B1");
    await answerFor(start.attemptId, start.firstQuestion.id);
    await expect(
      finaliseAssessment({ attemptId: start.attemptId, userId: LEARNER, currentBand: null, englishLevel: "B1" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.table("profiles").find((p) => p.user_id === LEARNER)?.placement_completed).toBe(false);
  });

  it("refuses to finalise another learner's attempt", async () => {
    const start = await startAssessment(OTHER, null, "B1");
    await expect(
      finaliseAssessment({ attemptId: start.attemptId, userId: LEARNER, currentBand: null, englishLevel: "B1" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("legitimate flow: completes and writes a server-computed result exactly once", async () => {
    const start = await startAssessment(LEARNER, null, "B1");
    const done = await runToCompletion(start.attemptId, start.firstQuestion.id);
    if (!done.done) throw new Error("expected completion");

    const first = await finaliseAssessment({ attemptId: start.attemptId, userId: LEARNER, currentBand: null, englishLevel: "B1" });
    expect(first.alreadyCompleted).toBe(false);
    expect(fake.rpcCalls).toHaveLength(1);
    const sent = fake.rpcCalls[0].args;
    expect(sent.p_user_id).toBe(LEARNER);
    expect((sent.p_result as { estimated_band: number }).estimated_band).toBe(done.result.estimatedBand);
    expect(fake.table("profiles").find((p) => p.user_id === LEARNER)?.placement_completed).toBe(true);

    const retry = await finaliseAssessment({ attemptId: start.attemptId, userId: LEARNER, currentBand: null, englishLevel: "B1" });
    expect(retry.alreadyCompleted).toBe(true);
    expect(fake.rpcCalls).toHaveLength(1);

    // No more answers are accepted once completed.
    await expect(answerFor(start.attemptId, start.firstQuestion.id)).rejects.toMatchObject({ status: 409 });
  });
});
