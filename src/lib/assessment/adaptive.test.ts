import { describe, it, expect } from "vitest";
import {
  selectNext,
  isSessionComplete,
  updateAbility,
  confidenceScore,
  type QuestionPool,
} from "./adaptive";
import type { SkillState } from "./types";
import type { CefrLevel } from "@/types/content";
import type { QuestionResponse } from "@/types/assessment";

function pool(entries: [string, "reading" | "listening", CefrLevel][]): QuestionPool[] {
  return entries.map(([id, skill, difficulty]) => ({ id, skill, difficulty }));
}

/** Matches the real seed distribution: 10 Reading, 4 Listening (supabase/assessment-schema.sql). */
const SEED_POOL: QuestionPool[] = pool([
  ["r-a2-1", "reading", "A2"], ["r-a2-2", "reading", "A2"],
  ["r-b1-1", "reading", "B1"], ["r-b1-2", "reading", "B1"],
  ["r-b2-1", "reading", "B2"], ["r-b2-2", "reading", "B2"],
  ["r-c1-1", "reading", "C1"], ["r-c1-2", "reading", "C1"],
  ["r-c2-1", "reading", "C2"], ["r-c2-2", "reading", "C2"],
  ["l-a2-1", "listening", "A2"],
  ["l-b1-1", "listening", "B1"],
  ["l-b2-1", "listening", "B2"],
  ["l-c1-1", "listening", "C1"],
]);

function emptyState(skill: "reading" | "listening"): SkillState {
  return { skill, abilityIndex: 2, responses: [] };
}

function respond(
  state: SkillState,
  questionId: string,
  difficulty: CefrLevel,
  correct: boolean,
): SkillState {
  const resp: QuestionResponse = {
    questionId,
    userAnswer: correct ? "correct" : "wrong",
    isCorrect: correct,
    timeTakenSeconds: 5,
    sequenceNumber: state.responses.length + 1,
    difficulty,
    skill: state.skill,
  };
  return {
    ...state,
    abilityIndex: updateAbility(state.abilityIndex, difficulty, correct),
    responses: [...state.responses, resp],
  };
}

describe("selectNext — normal adaptive progression", () => {
  it("alternates skills (reading first on tie) and targets near current ability", () => {
    let reading = emptyState("reading");
    let listening = emptyState("listening");
    const answered = new Set<string>();

    const first = selectNext(reading, listening, SEED_POOL, answered);
    expect(first?.skill).toBe("reading");

    reading = respond(reading, "r-b1-1", first!.targetLevel, true);
    answered.add("r-b1-1");

    const second = selectNext(reading, listening, SEED_POOL, answered);
    expect(second?.skill).toBe("listening");

    listening = respond(listening, "l-b1-1", second!.targetLevel, true);
    answered.add("l-b1-1");

    const third = selectNext(reading, listening, SEED_POOL, answered);
    expect(third?.skill).toBe("reading");
  });

  it("moves the reading target level up after consecutive correct answers", () => {
    let reading = emptyState("reading");
    let listening = emptyState("listening");
    const answered = new Set<string>();
    const readingTargets: CefrLevel[] = [];

    for (let i = 0; i < 8; i += 1) {
      const next = selectNext(reading, listening, SEED_POOL, answered);
      if (!next) break;
      if (next.skill === "reading") readingTargets.push(next.targetLevel);
      const id = SEED_POOL.find(
        (q) => q.skill === next.skill && q.difficulty === next.targetLevel && !answered.has(q.id),
      )!.id;
      answered.add(id);
      if (next.skill === "reading") reading = respond(reading, id, next.targetLevel, true);
      else listening = respond(listening, id, next.targetLevel, true);
    }

    const order: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
    for (let i = 1; i < readingTargets.length; i += 1) {
      expect(order.indexOf(readingTargets[i])).toBeGreaterThanOrEqual(order.indexOf(readingTargets[i - 1]));
    }
  });
});

describe("selectNext — one skill pool exhausted", () => {
  it("keeps returning the non-exhausted skill instead of recursing forever", () => {
    let listening = emptyState("listening");
    const answered = new Set<string>();
    for (const q of SEED_POOL.filter((q) => q.skill === "listening")) {
      listening = respond(listening, q.id, q.difficulty, true);
      answered.add(q.id);
    }
    // Listening is now at 4/4 responses -- pool-exhausted, but nowhere near MAX_PER_SKILL (7).
    const reading = emptyState("reading");

    const next = selectNext(reading, listening, SEED_POOL, answered);
    expect(next).not.toBeNull();
    expect(next?.skill).toBe("reading");
  });

  it("stays on reading for every subsequent call once listening is exhausted", () => {
    let listening = emptyState("listening");
    let reading = emptyState("reading");
    const answered = new Set<string>();
    for (const q of SEED_POOL.filter((q) => q.skill === "listening")) {
      listening = respond(listening, q.id, q.difficulty, true);
      answered.add(q.id);
    }

    // Reading has 10 questions; drive several more rounds and confirm every
    // pick is reading, none are null, and none throw.
    for (let i = 0; i < 6; i += 1) {
      const next = selectNext(reading, listening, SEED_POOL, answered);
      expect(next?.skill).toBe("reading");
      const id = SEED_POOL.find(
        (q) => q.skill === "reading" && q.difficulty === next!.targetLevel && !answered.has(q.id),
      )!.id;
      answered.add(id);
      reading = respond(reading, id, next!.targetLevel, true);
    }
  });
});

describe("selectNext — both pools exhausted", () => {
  it("returns null once every question has been answered", () => {
    let reading = emptyState("reading");
    let listening = emptyState("listening");
    const answered = new Set<string>();
    for (const q of SEED_POOL) {
      if (q.skill === "reading") reading = respond(reading, q.id, q.difficulty, true);
      else listening = respond(listening, q.id, q.difficulty, true);
      answered.add(q.id);
    }

    const next = selectNext(reading, listening, SEED_POOL, answered);
    expect(next).toBeNull();
  });

  it("returns null immediately for an empty pool without recursing", () => {
    const next = selectNext(emptyState("reading"), emptyState("listening"), [], new Set());
    expect(next).toBeNull();
  });
});

describe("selectNext — insufficient questions before MAX_PER_SKILL", () => {
  it("never asks for more than the 4 listening questions that exist, well under MAX_PER_SKILL=7", () => {
    let reading = emptyState("reading");
    let listening = emptyState("listening");
    const answered = new Set<string>();

    // Drive the full seed pool through selectNext, always answering
    // correctly, and count how many listening questions actually get asked.
    let listeningAsked = 0;
    let guard = 0;
    while (guard < 50) {
      guard += 1;
      const next = selectNext(reading, listening, SEED_POOL, answered);
      if (!next) break;
      if (next.skill === "listening") listeningAsked += 1;
      const id = SEED_POOL.find(
        (q) => q.skill === next.skill && q.difficulty === next.targetLevel && !answered.has(q.id),
      )!.id;
      answered.add(id);
      if (next.skill === "reading") reading = respond(reading, id, next.targetLevel, true);
      else listening = respond(listening, id, next.targetLevel, true);
    }

    expect(guard).toBeLessThan(50); // didn't hit the runaway guard
    expect(listeningAsked).toBe(4);
    expect(listening.responses.length).toBe(4);
  });
});

describe("isSessionComplete — early confidence termination", () => {
  it("completes once both skills reach MIN_PER_SKILL with high confidence", () => {
    let reading = emptyState("reading");
    let listening = emptyState("listening");
    // 5 consistent-level responses per skill (10 total/14 budget, zero
    // difficulty spread in the last 4) is the minimum that actually clears
    // the 0.80 confidence bar: countScore(10/14) * 0.7 + consistencyScore(1) * 0.3 = 0.8.
    for (let i = 0; i < 5; i += 1) {
      reading = respond(reading, `r-${i}`, "B1", true);
      listening = respond(listening, `l-${i}`, "B1", true);
    }
    expect(confidenceScore(reading, listening)).toBeGreaterThanOrEqual(0.8);
    expect(isSessionComplete(reading, listening)).toBe(true);
  });

  it("does not complete before MIN_PER_SKILL even with perfect consistency", () => {
    let reading = emptyState("reading");
    let listening = emptyState("listening");
    reading = respond(reading, "r-1", "B1", true);
    listening = respond(listening, "l-1", "B1", true);
    expect(isSessionComplete(reading, listening)).toBe(false);
  });

  it("completes once both skills hit MAX_PER_SKILL regardless of confidence", () => {
    let reading = emptyState("reading");
    let listening = emptyState("listening");
    const mixedLevels: CefrLevel[] = ["A1", "C2", "A1", "C2", "A1", "C2", "A1"];
    for (let i = 0; i < 7; i += 1) {
      reading = respond(reading, `r-${i}`, mixedLevels[i], i % 2 === 0);
      listening = respond(listening, `l-${i}`, mixedLevels[i], i % 2 === 0);
    }
    expect(isSessionComplete(reading, listening)).toBe(true);
  });
});

describe("selectNext — no infinite recursion / stack overflow", () => {
  it("runs the full seed pool to completion within a bounded number of calls", () => {
    let reading = emptyState("reading");
    let listening = emptyState("listening");
    const answered = new Set<string>();

    let iterations = 0;
    const MAX_ITERATIONS = SEED_POOL.length + 5;
    while (iterations < MAX_ITERATIONS) {
      iterations += 1;
      if (isSessionComplete(reading, listening)) break;
      const next = selectNext(reading, listening, SEED_POOL, answered);
      if (!next) break;
      const id = SEED_POOL.find(
        (q) => q.skill === next.skill && q.difficulty === next.targetLevel && !answered.has(q.id),
      )!.id;
      answered.add(id);
      if (next.skill === "reading") reading = respond(reading, id, next.targetLevel, true);
      else listening = respond(listening, id, next.targetLevel, true);
    }

    expect(iterations).toBeLessThan(MAX_ITERATIONS);
  });

  it("does not throw for a pool where one skill has zero questions at all", () => {
    const readingOnlyPool = SEED_POOL.filter((q) => q.skill === "reading");
    let reading = emptyState("reading");
    const listening = emptyState("listening");
    const answered = new Set<string>();

    expect(() => {
      let iterations = 0;
      while (iterations < 20) {
        iterations += 1;
        const next = selectNext(reading, listening, readingOnlyPool, answered);
        if (!next) break;
        answered.add(
          readingOnlyPool.find((q) => q.difficulty === next.targetLevel && !answered.has(q.id))!
            .id,
        );
        reading = respond(reading, [...answered].at(-1)!, next.targetLevel, true);
      }
    }).not.toThrow();
  });
});
