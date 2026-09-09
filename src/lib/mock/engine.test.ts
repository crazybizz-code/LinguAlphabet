/**
 * Engine tests use an in-memory fake Supabase client (no real DB, no network
 * calls) plus a mocked assembleMock() (its own selection logic is already
 * covered by assembler.test.ts) so these tests focus purely on what engine.ts
 * itself is responsible for: persisting the structural ids assembleMock()
 * returns, hydrating questions with their correct structural parent, and
 * keeping submission/scoring server-authoritative.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CefrLevel } from "@/types/content";

type Row = Record<string, unknown>;

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

class FakeSelectQuery {
  private filters: Array<(row: Row) => boolean> = [];
  constructor(private rows: Row[]) {}
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  gte() {
    return this;
  }
  private matched() {
    return this.rows.filter((r) => this.filters.every((f) => f(r)));
  }
  single() {
    const m = this.matched();
    return Promise.resolve(m[0] ? { data: m[0], error: null } : { data: null, error: { message: "not found" } });
  }
  maybeSingle() {
    const m = this.matched();
    return Promise.resolve({ data: m[0] ?? null, error: null });
  }
  then(resolve: (v: { data: Row[]; error: null }) => void) {
    resolve({ data: this.matched(), error: null });
  }
}

class FakeUpdateQuery {
  private filters: Array<(row: Row) => boolean> = [];
  constructor(
    private table: FakeTable,
    private patch: Row,
  ) {}
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  then(resolve: (v: { data: null; error: null }) => void) {
    for (const row of this.table.rows) {
      if (this.filters.every((f) => f(row))) Object.assign(row, this.patch);
    }
    resolve({ data: null, error: null });
  }
}

class FakeInsertResult {
  constructor(private inserted: Row[]) {}
  select() {
    return { single: () => Promise.resolve({ data: this.inserted[0] ?? null, error: null }) };
  }
  then(resolve: (v: { data: Row[]; error: null }) => void) {
    resolve({ data: this.inserted, error: null });
  }
}

class FakeTable {
  rows: Row[] = [];
  select() {
    return new FakeSelectQuery(this.rows);
  }
  insert(data: Row | Row[]) {
    // `status: "in_progress"` mirrors the real full_mock_attempts DEFAULT --
    // engine.ts's real insert calls never set `status` explicitly, relying
    // on the DB default. Harmless on every other (non-attempt) table, which
    // simply carries an unused extra key.
    const items = (Array.isArray(data) ? data : [data]).map((item) => ({
      status: "in_progress",
      id: (item as Row).id ?? randomId("row"),
      ...item,
    }));
    this.rows.push(...items);
    return new FakeInsertResult(items);
  }
  update(patch: Row) {
    return new FakeUpdateQuery(this, patch);
  }
}

let db: Record<string, FakeTable> = {};
function table(name: string): FakeTable {
  return (db[name] ??= new FakeTable());
}

vi.mock("@/lib/supabase/service-client", () => ({
  createServiceClient: () => ({ from: (name: string) => table(name) }),
}));

vi.mock("./assembler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./assembler")>();
  return { ...actual, assembleMock: vi.fn() };
});

const { startMock, saveAnswer, submitMock, isReadingOnlyAttempt, gradeReadingAnswer } = await import("./engine");
const assemblerModule = await import("./assembler");
const mockAssembleMock = vi.mocked(assemblerModule.assembleMock);

const READING_IDS = Array.from({ length: 40 }, (_, i) => `r-q${i}`);
const LISTENING_IDS = Array.from({ length: 40 }, (_, i) => `l-q${i}`);
const READING_PASSAGE_IDS = ["p1", "p2", "p3"];
const LISTENING_SECTION_IDS = ["s1", "s2", "s3", "s4"];

beforeEach(() => {
  db = {};
  mockAssembleMock.mockReset();
  mockAssembleMock.mockResolvedValue({
    readingIds: READING_IDS,
    listeningIds: LISTENING_IDS,
    readingPassageIds: READING_PASSAGE_IDS,
    listeningSectionIds: LISTENING_SECTION_IDS,
  });

  for (let i = 0; i < 40; i++) {
    table("assessment_questions").rows.push({
      id: READING_IDS[i],
      skill: "reading",
      type: "mc",
      difficulty: "B2",
      passage: null,
      passage_title: null,
      audio_url: null,
      question: `R question ${i}`,
      options: ["A", "B", "C", "D"],
      correct_answer: "A",
      explanation: null,
      mock_passage_id: READING_PASSAGE_IDS[i % 3],
      mock_listening_section_id: null,
    });
  }
  for (let i = 0; i < 40; i++) {
    table("assessment_questions").rows.push({
      id: LISTENING_IDS[i],
      skill: "listening",
      type: "mc",
      difficulty: "B2",
      passage: null,
      passage_title: null,
      audio_url: null,
      question: `L question ${i}`,
      options: ["A", "B", "C", "D"],
      correct_answer: "A",
      explanation: null,
      mock_passage_id: null,
      mock_listening_section_id: LISTENING_SECTION_IDS[i % 4],
    });
  }
});

describe("startMock — persists and returns the full structure", () => {
  it("does not create an attempt when assembly/runtime validation rejects the Reading set", async () => {
    mockAssembleMock.mockRejectedValueOnce(new Error("Reading mock assembly failed runtime validation: INVALID_OPTION_POOL"));

    await expect(startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel })).rejects.toThrow(/INVALID_OPTION_POOL/);
    expect(table("full_mock_attempts").rows).toHaveLength(0);
    expect(table("full_mock_responses").rows).toHaveLength(0);
    expect(table("question_exposure").rows).toHaveLength(0);
  });

  it("persists and returns the explicit 60-minute Reading limit", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    expect(session.readingTimeLimitSeconds).toBe(3600);
    expect(table("full_mock_attempts").rows[0].reading_time_limit_seconds).toBe(3600);
    expect(session.listeningTimeLimitSeconds).toBe(1500);
  });

  it("preserves all 3 Reading passage ids, on the persisted attempt AND the returned session", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    expect(session.readingPassageIds).toEqual(READING_PASSAGE_IDS);
    const persisted = table("full_mock_attempts").rows[0];
    expect(persisted.reading_passage_ids).toEqual(READING_PASSAGE_IDS);
  });

  it("preserves all 4 Listening section ids, on the persisted attempt AND the returned session", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    expect(session.listeningSectionIds).toEqual(LISTENING_SECTION_IDS);
    const persisted = table("full_mock_attempts").rows[0];
    expect(persisted.listening_section_ids).toEqual(LISTENING_SECTION_IDS);
  });

  it("every reading question traces to exactly one structural parent (a passage, never a section)", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    expect(session.readingQuestions).toHaveLength(40);
    for (const q of session.readingQuestions) {
      expect(q.passageId).not.toBeNull();
      expect(READING_PASSAGE_IDS).toContain(q.passageId);
      expect(q.sectionId).toBeNull();
    }
  });

  it("every listening question traces to exactly one structural parent (a section, never a passage)", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    expect(session.listeningQuestions).toHaveLength(40);
    for (const q of session.listeningQuestions) {
      expect(q.sectionId).not.toBeNull();
      expect(LISTENING_SECTION_IDS).toContain(q.sectionId);
      expect(q.passageId).toBeNull();
    }
  });

  it("Reading never contains a listening question, and Listening never contains a reading question", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    const listeningIdSet = new Set(LISTENING_IDS);
    const readingIdSet = new Set(READING_IDS);
    for (const q of session.readingQuestions) expect(listeningIdSet.has(q.id)).toBe(false);
    for (const q of session.listeningQuestions) expect(readingIdSet.has(q.id)).toBe(false);
  });

  it("calls assembleMock() exactly once -- structure is computed once and persisted, never recomputed on reload", async () => {
    await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    expect(mockAssembleMock).toHaveBeenCalledTimes(1);
  });

  it("refreshing/reloading reads back the identical persisted structure (same attempt row, read twice)", async () => {
    await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    const firstRead = { ...table("full_mock_attempts").rows[0] };
    const secondRead = { ...table("full_mock_attempts").rows[0] };

    expect(secondRead.reading_passage_ids).toEqual(firstRead.reading_passage_ids);
    expect(secondRead.listening_section_ids).toEqual(firstRead.listening_section_ids);
    expect(secondRead.reading_question_ids).toEqual(firstRead.reading_question_ids);
    expect(secondRead.listening_question_ids).toEqual(firstRead.listening_question_ids);
  });
});

describe("submitMock — server-authoritative scoring", () => {
  it("scores using exactly the same 40 Reading + 40 Listening questions the attempt was assembled with", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    const result = await submitMock({ attemptId: session.attemptId, userId: "user-1" });

    expect(result.readingTotal).toBe(40);
    expect(result.listeningTotal).toBe(40);
  });

  it("throws instead of silently scoring a drifted attempt (a response row missing relative to the attempt's own recorded structure)", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    // Simulate a data-integrity anomaly: one pre-inserted response row is
    // gone. This must never happen via the real client-facing API (saveAnswer
    // only updates existing rows -- see the security tests below) -- this
    // test proves the code detects it rather than silently scoring 39/40 as
    // if it were a normal outcome.
    const responses = table("full_mock_responses");
    responses.rows = responses.rows.filter((r) => r.question_id !== READING_IDS[0]);

    await expect(submitMock({ attemptId: session.attemptId, userId: "user-1" })).rejects.toThrow(
      /expected exactly 40 reading and 40 listening responses, found 39 and 40/i,
    );
  });

  it("grades using the SERVER-fetched correct_answer, never anything the client could imply", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    await saveAnswer({ attemptId: session.attemptId, userId: "user-1", questionId: READING_IDS[0], section: "reading", userAnswer: "A", sequenceNumber: 1 });
    await saveAnswer({ attemptId: session.attemptId, userId: "user-1", questionId: READING_IDS[1], section: "reading", userAnswer: "B", sequenceNumber: 2 });

    const result = await submitMock({ attemptId: session.attemptId, userId: "user-1" });

    // Every seeded question's correct_answer is "A" -- only the first saved
    // answer ("A") should grade correct; the second ("B") should not.
    expect(result.readingCorrect).toBe(1);
  });
});

describe("security — no client-supplied structure can change the server's authoritative attempt", () => {
  it("saveAnswer() rejects a question id that isn't part of this attempt", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    const beforeCount = table("full_mock_responses").rows.length;

    await expect(saveAnswer({
      attemptId: session.attemptId,
      userId: "user-1",
      questionId: "attacker-supplied-foreign-id",
      section: "reading",
      userAnswer: "A",
      sequenceNumber: 1,
    })).rejects.toThrow(/does not belong to this attempt/i);

    // No new row was created -- the UPDATE matched zero rows and silently
    // did nothing, exactly as intended (there is no code path that inserts
    // a new full_mock_responses row from client input after startMock()).
    expect(table("full_mock_responses").rows).toHaveLength(beforeCount);
    expect(table("full_mock_responses").rows.some((r) => r.question_id === "attacker-supplied-foreign-id")).toBe(false);
  });

  it("saveAnswer() rejects a valid question paired with a forged sequence number", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    await expect(saveAnswer({
      attemptId: session.attemptId,
      userId: "user-1",
      questionId: READING_IDS[0],
      section: "reading",
      userAnswer: "A",
      sequenceNumber: 40,
    })).rejects.toThrow(/supplied section and sequence/i);
  });

  it("saveAnswer() cannot write to another user's attempt", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    await expect(
      saveAnswer({
        attemptId: session.attemptId,
        userId: "attacker",
        questionId: READING_IDS[0],
        section: "reading",
        userAnswer: "A",
        sequenceNumber: 1,
      }),
    ).rejects.toThrow(/Attempt not found/i);
  });

  it("submitMock() ignores any structure implied by full_mock_responses rows outside the attempt's own recorded question ids", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });

    // Even if a stray response row somehow referenced a foreign question,
    // submitMock() only ever fetches correct_answer for
    // attempt.reading_question_ids/listening_question_ids -- a foreign
    // question's answer is never looked up or scored.
    table("full_mock_responses").rows.push({
      id: randomId("resp"),
      attempt_id: session.attemptId,
      question_id: "foreign-question",
      section: "reading",
      user_answer: "A",
      is_correct: null,
      sequence_number: 999,
    });

    // This now also exercises the explicit count guard (41 reading responses
    // instead of 40), which is the correct, intended failure mode -- a
    // response row that doesn't belong to this attempt's own structure is a
    // data-integrity anomaly, not a normal 41-question mock.
    await expect(submitMock({ attemptId: session.attemptId, userId: "user-1" })).rejects.toThrow(/expected exactly 40 reading/i);
  });

  it("rejects a response whose section label disagrees with the attempt's recorded structure", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    const readingResponse = table("full_mock_responses").rows.find((row) => row.question_id === READING_IDS[0])!;
    const listeningResponse = table("full_mock_responses").rows.find((row) => row.question_id === LISTENING_IDS[0])!;
    readingResponse.question_id = LISTENING_IDS[0];
    listeningResponse.question_id = READING_IDS[0];

    await expect(submitMock({ attemptId: session.attemptId, userId: "user-1" })).rejects.toThrow(
      /response structure does not match the attempt's recorded question ids/i,
    );
  });

  it("fails safely when grading metadata is missing for a recorded question", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    table("assessment_questions").rows = table("assessment_questions").rows.filter((row) => row.id !== READING_IDS[0]);

    await expect(submitMock({ attemptId: session.attemptId, userId: "user-1" })).rejects.toThrow(
      /grading metadata is missing/i,
    );
  });
});

/**
 * MOCK 13-TYPE RUNTIME — read path + completion grading.
 *
 * These exercise the two engine seams added for the content contract: the
 * client-facing hydration must carry the new structural/presentation fields
 * (and must NOT carry answer data), and completion-family answers must grade
 * through the contract's own answersMatch() instead of exact string equality.
 */
describe("startMock — client-facing question mapping carries the new contract fields", () => {
  it("exposes optionPool, wordLimit, groupId and mockSequence from the DB row", async () => {
    const target = table("assessment_questions").rows.find((r) => r.id === READING_IDS[0])!;
    target.type = "matching_headings";
    target.option_pool = [{ id: "i", text: "First heading" }];
    target.answer_word_limit = null;
    target.mock_group_id = "grp-1";
    target.mock_sequence = 7;

    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    const q = session.readingQuestions.find((x) => x.id === READING_IDS[0])!;

    expect(q.type).toBe("matching_headings");
    expect(q.optionPool).toEqual([{ id: "i", text: "First heading" }]);
    expect(q.groupId).toBe("grp-1");
    expect(q.mockSequence).toBe(7);
    expect(q.wordLimit).toBeNull();
  });

  it("decodes answer_word_limit into the contract's WordLimit shape", async () => {
    const target = table("assessment_questions").rows.find((r) => r.id === READING_IDS[1])!;
    target.type = "sentence_completion";
    target.answer_word_limit = "TWO_WORDS_AND_OR_A_NUMBER";

    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    const q = session.readingQuestions.find((x) => x.id === READING_IDS[1])!;

    expect(q.wordLimit).toEqual({ maxWords: 2, allowNumber: true });
  });

  it("leaves the new fields null for legacy rows that don't set them", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    const q = session.readingQuestions.find((x) => x.id === READING_IDS[5])!;

    expect(q.optionPool).toBeNull();
    expect(q.wordLimit).toBeNull();
    expect(q.groupId).toBeNull();
    expect(q.mockSequence).toBeNull();
  });

  it("anti-cheat: no answer data reaches the client, including the new accepted_answers", async () => {
    const target = table("assessment_questions").rows.find((r) => r.id === READING_IDS[2])!;
    target.type = "sentence_completion";
    target.correct_answer = "colour";
    target.accepted_answers = ["color"];
    target.explanation = "Because reasons.";

    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    const serialized = JSON.stringify(session);

    expect(serialized).not.toContain("colour");
    expect(serialized).not.toContain("color");
    expect(serialized).not.toContain("Because reasons.");
    for (const q of [...session.readingQuestions, ...session.listeningQuestions]) {
      expect(q.correctAnswer).toBe("");
      expect(q.explanation).toBeNull();
      expect(q).not.toHaveProperty("acceptedAnswers");
      expect(q).not.toHaveProperty("accepted_answers");
    }
  });
});

describe("submitMock — completion-family grading uses answersMatch()", () => {
  async function gradeSingleAnswer(rowPatch: Record<string, unknown>, userAnswer: string) {
    const target = table("assessment_questions").rows.find((r) => r.id === READING_IDS[0])!;
    Object.assign(target, rowPatch);
    if (["sentence_completion", "summary_completion", "note_completion"].includes(String(target.type))
      && target.option_pool == null
      && !("answer_word_limit" in rowPatch)) {
      target.answer_word_limit = "THREE_WORDS";
    }

    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    const resp = table("full_mock_responses").rows.find(
      (r) => r.attempt_id === session.attemptId && r.question_id === READING_IDS[0],
    )!;
    resp.user_answer = userAnswer;

    await submitMock({ attemptId: session.attemptId, userId: "user-1" });
    return resp.is_correct as boolean;
  }

  it("accepts an alternate spelling listed in accepted_answers", async () => {
    const ok = await gradeSingleAnswer(
      { type: "sentence_completion", correct_answer: "colour", accepted_answers: ["color"] },
      "color",
    );
    expect(ok).toBe(true);
  });

  it("rejects an answer that is in neither correct_answer nor accepted_answers", async () => {
    const ok = await gradeSingleAnswer(
      { type: "sentence_completion", correct_answer: "colour", accepted_answers: ["color"] },
      "colours",
    );
    expect(ok).toBe(false);
  });

  it("still accepts the primary correct_answer, and normalizes case/whitespace/outer punctuation", async () => {
    expect(await gradeSingleAnswer({ type: "note_completion", correct_answer: "colour", accepted_answers: null }, "  COLOUR. ")).toBe(true);
  });

  it("handles a completion row with no accepted_answers at all", async () => {
    expect(await gradeSingleAnswer({ type: "summary_completion", correct_answer: "north", accepted_answers: null }, "north")).toBe(true);
    expect(await gradeSingleAnswer({ type: "summary_completion", correct_answer: "north", accepted_answers: null }, "south")).toBe(false);
  });

  it("non-completion families use normalized primary-answer grading and ignore accepted_answers", async () => {
    // A matching question must be graded on its pool id alone; an alternate
    // list must never widen a non-completion answer.
    expect(await gradeSingleAnswer({ type: "matching_headings", correct_answer: "ii", accepted_answers: ["iii"] }, "iii")).toBe(false);
    expect(await gradeSingleAnswer({ type: "matching_headings", correct_answer: "ii", accepted_answers: ["iii"] }, "ii")).toBe(true);
    expect(await gradeSingleAnswer({ type: "matching_headings", correct_answer: "ii", accepted_answers: ["iii"] }, "  II. ")).toBe(true);
  });

  it("legacy 'mc' grading is byte-for-byte unchanged (case-insensitive exact match)", async () => {
    expect(await gradeSingleAnswer({ type: "mc", correct_answer: "A", accepted_answers: null }, "a")).toBe(true);
    expect(await gradeSingleAnswer({ type: "mc", correct_answer: "A", accepted_answers: null }, "B")).toBe(false);
  });

  it("legacy 'fill' is NOT treated as a contract completion type -- exact match preserved", async () => {
    expect(await gradeSingleAnswer({ type: "fill", correct_answer: "colour", accepted_answers: ["color"] }, "color")).toBe(false);
    expect(await gradeSingleAnswer({ type: "fill", correct_answer: "colour", accepted_answers: ["color"] }, "colour")).toBe(true);
  });

  it("rejects an otherwise-correct free-text answer when it exceeds the declared word limit", async () => {
    expect(await gradeSingleAnswer(
      { type: "sentence_completion", correct_answer: "natural succession", answer_word_limit: "ONE_WORD" },
      "natural succession",
    )).toBe(false);
  });

  it("fails closed when a free-text completion has an invalid or missing word-limit label", () => {
    const base = { type: "summary_completion", correct_answer: "north", accepted_answers: null, option_pool: null };
    expect(gradeReadingAnswer({ ...base, answer_word_limit: null }, "north")).toBe(false);
    expect(gradeReadingAnswer({ ...base, answer_word_limit: "FOUR_WORDS" }, "north")).toBe(false);
  });

  it("grades word-bank completion by normalized pool id without applying a text word limit", () => {
    expect(gradeReadingAnswer({
      type: "summary_completion",
      correct_answer: "J",
      accepted_answers: ["wrong-alternate"],
      answer_word_limit: null,
      option_pool: [{ id: "J", text: "habitat" }],
    }, " j. ")).toBe(true);
  });

  it.each([
    ["multiple_choice", "Alpha", " alpha. "],
    ["true_false_not_given", "NOT GIVEN", " not   given. "],
    ["yes_no_not_given", "YES", " yes! "],
    ["matching_information", "C", " c. "],
    ["matching_features", "D", " d "],
    ["matching_sentence_endings", "A", " a. "],
  ])("normalizes Reading %s answers server-side", (type, correctAnswer, userAnswer) => {
    expect(gradeReadingAnswer({
      type,
      correct_answer: correctAnswer,
      accepted_answers: null,
      answer_word_limit: null,
      option_pool: null,
    }, userAnswer)).toBe(true);
  });
});

/**
 * READING-ONLY MOCK. Reading assembly, grading and scoring are unchanged --
 * only the Listening half becomes skippable, and only when the caller asks.
 */
describe("startMock — reading-only persistence", () => {
  beforeEach(() => {
    mockAssembleMock.mockReset();
    mockAssembleMock.mockResolvedValue({
      readingIds: READING_IDS,
      listeningIds: [],
      readingPassageIds: READING_PASSAGE_IDS,
      listeningSectionIds: [],
    });
  });

  it("requests a reading-only assembly when sections is 'reading_only'", async () => {
    await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel, sections: "reading_only" });
    expect(mockAssembleMock).toHaveBeenCalledWith("user-1", "B2", { includeListening: false });
  });

  it("persists 40 reading ids, an empty listening array, and NULL listening_section_ids", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel, sections: "reading_only" });
    const persisted = table("full_mock_attempts").rows[0];

    expect(persisted.reading_question_ids).toEqual(READING_IDS);
    expect(persisted.reading_passage_ids).toEqual(READING_PASSAGE_IDS);
    expect(persisted.listening_question_ids).toEqual([]);
    // NULL, not [] -- the DB CHECK is "IS NULL OR cardinality = 4", so an
    // empty array would violate the constraint.
    expect(persisted.listening_section_ids).toBeNull();
    expect(session.listeningQuestions).toEqual([]);
  });

  it("pre-inserts exactly 40 response rows, all reading", async () => {
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel, sections: "reading_only" });
    const rows = table("full_mock_responses").rows.filter((r) => r.attempt_id === session.attemptId);

    expect(rows).toHaveLength(40);
    expect(rows.every((r) => r.section === "reading")).toBe(true);
  });

  it("REGRESSION: omitting sections still assembles a FULL mock", async () => {
    await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    expect(mockAssembleMock).toHaveBeenCalledWith("user-1", "B2", { includeListening: true });
  });
});

describe("submitMock — reading-only", () => {
  async function startReadingOnly() {
    mockAssembleMock.mockReset();
    mockAssembleMock.mockResolvedValue({
      readingIds: READING_IDS,
      listeningIds: [],
      readingPassageIds: READING_PASSAGE_IDS,
      listeningSectionIds: [],
    });
    return startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel, sections: "reading_only" });
  }

  it("submits successfully with zero listening responses", async () => {
    const session = await startReadingOnly();
    const result = await submitMock({ attemptId: session.attemptId, userId: "user-1" });

    expect(result.readingTotal).toBe(40);
    expect(result.listeningTotal).toBe(0);
    expect(result.listeningCorrect).toBe(0);
  });

  it("reading scoring is unchanged -- overall equals reading when there is no listening", async () => {
    const session = await startReadingOnly();
    // Answer 22 of 40 reading questions correctly ("A" is the seeded answer).
    const responses = table("full_mock_responses").rows.filter((r) => r.attempt_id === session.attemptId);
    responses.forEach((r, i) => { r.user_answer = i < 22 ? "A" : "B"; });

    const result = await submitMock({ attemptId: session.attemptId, userId: "user-1" });

    expect(result.readingCorrect).toBe(22);
    expect(result.readingTotal).toBe(40);
    expect(result.overallScorePct).toBeCloseTo(55, 5);
    // Overall is computed from reading alone, so it must equal the reading pct.
    const persisted = table("full_mock_attempts").rows[0];
    expect(persisted.reading_score_pct).toBeCloseTo(55, 5);
    expect(result.overallScorePct).toBeCloseTo(persisted.reading_score_pct as number, 5);
  });

  it("still requires exactly 40 READING responses in reading-only mode", async () => {
    const session = await startReadingOnly();
    const rows = table("full_mock_responses").rows;
    const idx = rows.findIndex((r) => r.attempt_id === session.attemptId && r.section === "reading");
    rows.splice(idx, 1); // drop one -> 39

    await expect(submitMock({ attemptId: session.attemptId, userId: "user-1" })).rejects.toThrow(/expected exactly 40 reading and 0 listening/i);
  });

  it("REGRESSION: a FULL mock still requires its recorded 40 listening responses", async () => {
    // Default fixture assembles 40+40.
    const session = await startMock({ userId: "user-1", targetCefrLevel: "B2" as CefrLevel });
    const rows = table("full_mock_responses").rows;
    const idx = rows.findIndex((r) => r.attempt_id === session.attemptId && r.section === "listening");
    rows.splice(idx, 1); // 39 listening

    await expect(submitMock({ attemptId: session.attemptId, userId: "user-1" })).rejects.toThrow(/expected exactly 40 reading and 40 listening/i);
  });
});

describe("isReadingOnlyAttempt", () => {
  it("treats an empty or missing listening id array as reading-only", () => {
    expect(isReadingOnlyAttempt([])).toBe(true);
    expect(isReadingOnlyAttempt(null)).toBe(true);
    expect(isReadingOnlyAttempt(undefined)).toBe(true);
  });

  it("treats any recorded listening question as a full mock", () => {
    expect(isReadingOnlyAttempt(["l-q0"])).toBe(false);
    expect(isReadingOnlyAttempt(LISTENING_IDS)).toBe(false);
  });
});
