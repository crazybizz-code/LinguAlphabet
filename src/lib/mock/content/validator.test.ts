import { describe, it, expect } from "vitest";
import {
  validateQuestionGroup,
  isWordBankGroup,
  validateReadingMock,
  validateListeningMock,
  validateFullMockContent,
  buildReadingContractFromRows,
  validateAssembledMock,
  type AssembledQuestionRow,
} from "./validator";
import { normalizeAnswer, answersMatch } from "./normalization";
import type {
  MockQuestionContract,
  MockQuestionGroupContract,
  MockPassageContract,
  MockListeningSectionContract,
  MockReadingContentContract,
  MockListeningContentContract,
} from "./types";

// ── Fixture builders ───────────────────────────────────────────────────────
// Deliberately explicit (no shared "valid base" mutated in place per-test)
// so every fixture is fully self-contained and it's obvious what's broken in
// each malformed case.

function mcq(overrides: Partial<MockQuestionContract> = {}): MockQuestionContract {
  return {
    id: overrides.id ?? "q-mcq-1",
    skill: "reading",
    type: "multiple_choice",
    order: 1,
    questionText: "What is the main purpose of the passage?",
    options: ["To inform", "To persuade", "To entertain", "To confuse"],
    correctAnswer: "To inform",
    difficulty: "B2",
    structuralParentId: "p1",
    ...overrides,
  };
}

function tfng(overrides: Partial<MockQuestionContract> = {}): MockQuestionContract {
  return {
    id: overrides.id ?? "q-tfng-1",
    skill: "reading",
    type: "true_false_not_given",
    order: 2,
    questionText: "The author believes climate change is reversible.",
    correctAnswer: "TRUE",
    difficulty: "B2",
    structuralParentId: "p1",
    ...overrides,
  };
}

function completionQuestion(overrides: Partial<MockQuestionContract> = {}): MockQuestionContract {
  return {
    id: overrides.id ?? "q-comp-1",
    skill: "reading",
    type: "sentence_completion",
    order: 3,
    questionText: "The experiment was conducted in a ___.",
    correctAnswer: "laboratory",
    wordLimit: { maxWords: 1, allowNumber: false },
    difficulty: "B2",
    structuralParentId: "p1",
    ...overrides,
  };
}

function matchingGroup(overrides: Partial<MockQuestionGroupContract> = {}): MockQuestionGroupContract {
  const optionPool = overrides.optionPool ?? [
    { id: "A", text: "Heading A" },
    { id: "B", text: "Heading B" },
    { id: "C", text: "Heading C" },
  ];
  const questions =
    overrides.questions ??
    [
      {
        id: "q-match-1",
        skill: "reading" as const,
        type: "matching_headings" as const,
        order: 4,
        questionText: "Paragraph 1",
        correctAnswer: "A",
        difficulty: "B2" as const,
        structuralParentId: "p1",
        groupId: "group-1",
      },
      {
        id: "q-match-2",
        skill: "reading" as const,
        type: "matching_headings" as const,
        order: 5,
        questionText: "Paragraph 2",
        correctAnswer: "B",
        difficulty: "B2" as const,
        structuralParentId: "p1",
        groupId: "group-1",
      },
    ];
  return {
    groupId: "group-1",
    taskType: "matching_headings",
    instructions: "Match each paragraph to the correct heading.",
    optionPool,
    questions,
    ...overrides,
  };
}

function singleQuestionGroup(question: MockQuestionContract): MockQuestionGroupContract {
  return {
    groupId: `standalone-${question.id}`,
    taskType: question.type,
    instructions: "",
    questions: [question],
  };
}

/** Builds a structurally valid single passage with N distinct MCQ questions
 * (ids/order auto-generated), used to pad passages/sections up to the exact
 * 40-question requirement without hand-writing 40 fixtures per test. */
function fillerQuestions(count: number, startIndex: number, parentId: string, skill: "reading" | "listening"): MockQuestionContract[] {
  return Array.from({ length: count }, (_, i) => {
    const idx = startIndex + i;
    return {
      id: `q-filler-${parentId}-${idx}`,
      skill,
      type: "multiple_choice" as const,
      order: idx,
      questionText: `Filler question number ${idx}?`,
      options: ["Option one", "Option two", "Option three"],
      correctAnswer: "Option one",
      difficulty: "B2" as const,
      structuralParentId: parentId,
    };
  });
}

function validPassage(id: string, questionCount: number): MockPassageContract {
  return {
    id,
    title: `Passage ${id}`,
    difficulty: "B2",
    bodyText: "Some passage body text.",
    questionGroups: [{ groupId: `g-${id}`, taskType: "multiple_choice", instructions: "", questions: fillerQuestions(questionCount, 1, id, "reading") }],
  };
}

function validSection(id: string, questionCount: number): MockListeningSectionContract {
  return {
    id,
    title: `Section ${id}`,
    difficulty: "B2",
    transcript: "Some transcript.",
    audioUrl: null,
    questionGroups: [{ groupId: `g-${id}`, taskType: "multiple_choice", instructions: "", questions: fillerQuestions(questionCount, 1, id, "listening") }],
  };
}

/** A complete, valid 3-passage / 40-question Reading mock: 14 + 13 + 13. */
function validReadingMock(): MockReadingContentContract {
  return { passages: [validPassage("p1", 14), validPassage("p2", 13), validPassage("p3", 13)] };
}

/** A complete, valid 4-section / 40-question Listening mock: 10 each. */
function validListeningMock(): MockListeningContentContract {
  return { sections: [validSection("s1", 10), validSection("s2", 10), validSection("s3", 10), validSection("s4", 10)] };
}

function codesOf(errors: { code: string }[]): string[] {
  return errors.map((e) => e.code);
}

// ── A: valid reading passage passes ─────────────────────────────────────────
describe("valid content passes", () => {
  it("A: a valid reading passage (standalone) produces no errors related to its own content", () => {
    const passage = validPassage("p1", 14);
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("B: a valid listening section (standalone) produces no errors related to its own content", () => {
    const section = validSection("s1", 10);
    const result = validateListeningMock({ sections: [section, validSection("s2", 10), validSection("s3", 10), validSection("s4", 10)] });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("C: a valid complete reading mock (3 passages / 40 questions) is valid", () => {
    const result = validateReadingMock(validReadingMock());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("D: a valid complete listening mock (4 sections / 40 questions) is valid", () => {
    const result = validateListeningMock(validListeningMock());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("full mock content (valid reading + valid listening) is valid", () => {
    const result = validateFullMockContent({ reading: validReadingMock(), listening: validListeningMock() });
    expect(result.valid).toBe(true);
  });

  it("valid TFNG, YNNG, matching, and completion questions all pass inside a passage", () => {
    const passage: MockPassageContract = {
      id: "p1",
      title: "Mixed",
      difficulty: "B2",
      bodyText: "text",
      questionGroups: [
        singleQuestionGroup(tfng()),
        singleQuestionGroup({ ...tfng(), id: "q-ynng-1", type: "yes_no_not_given", questionText: "The author recommends immediate government action.", correctAnswer: "NOT GIVEN" }),
        matchingGroup(),
        singleQuestionGroup(completionQuestion()),
      ],
    };
    const errors = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] }).errors;
    // This fixture passage (index 0) is itself content-valid -- the only
    // errors allowed anywhere in the result are mock-level total-count
    // errors (this single fixture doesn't total 40 across the whole mock),
    // never a per-question/group error rooted at passages[0].
    expect(errors.some((e) => e.path.startsWith("reading.passages[0]"))).toBe(false);
  });

  it("normalized answer comparison: TRUE/true/ True are all accepted for TFNG", () => {
    for (const variant of ["TRUE", "true", " True "]) {
      const q = tfng({ correctAnswer: variant });
      const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
      const errors = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 14)] }).errors;
      expect(errors.some((e) => e.path.startsWith("reading.passages[0]"))).toBe(false);
    }
  });
});

// ── Rejection cases ─────────────────────────────────────────────────────────
describe("rejection cases (deliberately malformed fixtures)", () => {
  it("E: invalid MCQ (only 2 options) is rejected", () => {
    const q = mcq({ options: ["Only one", "Only two"] });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(result.valid).toBe(false);
    expect(codesOf(result.errors)).toContain("INVALID_MCQ_OPTIONS");
  });

  it("F: MCQ with multiple correct options is rejected", () => {
    const q = mcq({ options: ["To inform", "To inform", "To entertain", "To confuse"], correctAnswer: "To inform" });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("MCQ_MULTIPLE_CORRECT_OPTIONS");
  });

  it("missing correct answer is rejected", () => {
    const q = mcq({ correctAnswer: "" });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("MISSING_CORRECT_ANSWER");
  });

  it("G: MCQ with no matching correct option is rejected", () => {
    const q = mcq({ correctAnswer: "Not one of the options" });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("MCQ_NO_CORRECT_OPTION");
  });

  it("H: invalid True/False/Not Given answer is rejected", () => {
    const q = tfng({ correctAnswer: "Maybe" });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("INVALID_TFNG_ANSWER");
  });

  it("I: invalid Yes/No/Not Given answer is rejected", () => {
    const q = tfng({ type: "yes_no_not_given", correctAnswer: "TRUE" });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("INVALID_YNNG_ANSWER");
  });

  it("J: matching group with fewer pool options than questions is rejected", () => {
    const group = matchingGroup({ optionPool: [{ id: "A", text: "Heading A" }] });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [group] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("MATCHING_COUNT_MISMATCH");
  });

  it("matching question referencing an id not in the pool is rejected", () => {
    const group = matchingGroup({
      questions: [
        { id: "q1", skill: "reading", type: "matching_headings", order: 1, questionText: "Para 1", correctAnswer: "Z", difficulty: "B2", structuralParentId: "p1", groupId: "group-1" },
      ],
    });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [group] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("INVALID_POOL_REFERENCE");
  });

  it("matching-style question with no option pool at all is rejected", () => {
    const group = matchingGroup({ optionPool: undefined });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [group] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("MISSING_OPTION_POOL");
  });

  it("K: completion question violating its declared word limit is rejected", () => {
    const q = completionQuestion({ correctAnswer: "a large industrial laboratory", wordLimit: { maxWords: 1, allowNumber: false } });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("WORD_LIMIT_EXCEEDED");
  });

  it("completion question with no declared word limit is rejected", () => {
    const q = completionQuestion({ wordLimit: undefined });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("INVALID_COMPLETION_ANSWER");
  });

  it("L: duplicate question ID across the mock is rejected", () => {
    const passages = validReadingMock().passages;
    // Force a duplicate id: reuse p2's first question id inside p1.
    passages[0].questionGroups[0].questions[0] = { ...passages[0].questionGroups[0].questions[0], id: passages[1].questionGroups[0].questions[0].id };
    const result = validateReadingMock({ passages });
    expect(codesOf(result.errors)).toContain("DUPLICATE_QUESTION_ID");
  });

  it("duplicate question text within the same passage is rejected", () => {
    const q1 = mcq({ id: "q1", questionText: "What is the theme?" });
    const q2 = mcq({ id: "q2", questionText: "What is the theme?" });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q1), singleQuestionGroup(q2)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("DUPLICATE_QUESTION_TEXT");
  });

  it("M: question missing its structural parent id is rejected", () => {
    const q = mcq({ structuralParentId: "" });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("MISSING_STRUCTURAL_PARENT");
  });

  it("N: cross-skill structural mismatch — question points to a different passage than the one containing it", () => {
    const q = mcq({ structuralParentId: "some-other-passage" });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("WRONG_STRUCTURAL_PARENT");
  });

  it("reading content containing a listening-skill question is rejected", () => {
    const q = mcq({ skill: "listening" });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("READING_CONTAINS_LISTENING");
  });

  it("listening content containing a reading-skill question is rejected", () => {
    const q: MockQuestionContract = {
      id: "q1",
      skill: "reading",
      type: "multiple_choice",
      order: 1,
      questionText: "Wrong skill entirely",
      options: ["a", "b", "c"],
      correctAnswer: "a",
      difficulty: "B2",
      structuralParentId: "s1",
    };
    const section: MockListeningSectionContract = { id: "s1", title: null, difficulty: "B2", transcript: "", audioUrl: null, questionGroups: [singleQuestionGroup(q)] };
    const result = validateListeningMock({ sections: [section, validSection("s2", 10), validSection("s3", 10), validSection("s4", 10)] });
    expect(codesOf(result.errors)).toContain("LISTENING_CONTAINS_READING");
  });

  it("a type valid for reading but not listening is rejected in a listening section (SKILL_TYPE_MISMATCH)", () => {
    const q: MockQuestionContract = {
      id: "q1",
      skill: "listening",
      type: "matching_headings",
      order: 1,
      questionText: "Not a real listening type",
      correctAnswer: "A",
      difficulty: "B2",
      structuralParentId: "s1",
    };
    const section: MockListeningSectionContract = { id: "s1", title: null, difficulty: "B2", transcript: "", audioUrl: null, questionGroups: [singleQuestionGroup(q)] };
    const result = validateListeningMock({ sections: [section, validSection("s2", 10), validSection("s3", 10), validSection("s4", 10)] });
    expect(codesOf(result.errors)).toContain("SKILL_TYPE_MISMATCH");
  });

  it("an unrecognised question type is rejected", () => {
    const q = mcq({ type: "essay" as MockQuestionContract["type"] });
    const passage: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [singleQuestionGroup(q)] };
    const result = validateReadingMock({ passages: [passage, validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("INVALID_QUESTION_TYPE");
  });

  it("O: reading mock with fewer than 40 questions is rejected", () => {
    const result = validateReadingMock({ passages: [validPassage("p1", 5), validPassage("p2", 5), validPassage("p3", 5)] });
    expect(codesOf(result.errors)).toContain("WRONG_READING_QUESTION_COUNT");
  });

  it("P: listening mock with fewer than 40 questions is rejected", () => {
    const result = validateListeningMock({ sections: [validSection("s1", 5), validSection("s2", 5), validSection("s3", 5), validSection("s4", 5)] });
    expect(codesOf(result.errors)).toContain("WRONG_LISTENING_QUESTION_COUNT");
  });

  it("Q: reading mock without exactly 3 passages is rejected (2 passages)", () => {
    const result = validateReadingMock({ passages: [validPassage("p1", 20), validPassage("p2", 20)] });
    expect(codesOf(result.errors)).toContain("WRONG_PASSAGE_COUNT");
  });

  it("reading mock with 4 passages is also rejected", () => {
    const result = validateReadingMock({ passages: [validPassage("p1", 10), validPassage("p2", 10), validPassage("p3", 10), validPassage("p4", 10)] });
    expect(codesOf(result.errors)).toContain("WRONG_PASSAGE_COUNT");
  });

  it("R: listening mock without exactly 4 sections is rejected (3 sections)", () => {
    const result = validateListeningMock({ sections: [validSection("s1", 14), validSection("s2", 13), validSection("s3", 13)] });
    expect(codesOf(result.errors)).toContain("WRONG_SECTION_COUNT");
  });

  it("S: empty passage (zero questions) is rejected", () => {
    const empty: MockPassageContract = { id: "p1", title: null, difficulty: "B2", bodyText: "", questionGroups: [] };
    const result = validateReadingMock({ passages: [empty, validPassage("p2", 20), validPassage("p3", 20)] });
    expect(codesOf(result.errors)).toContain("EMPTY_PASSAGE");
  });

  it("T: empty listening section (zero questions) is rejected", () => {
    const empty: MockListeningSectionContract = { id: "s1", title: null, difficulty: "B2", transcript: "", audioUrl: null, questionGroups: [] };
    const result = validateListeningMock({ sections: [empty, validSection("s2", 14), validSection("s3", 13), validSection("s4", 13)] });
    expect(codesOf(result.errors)).toContain("EMPTY_SECTION");
  });

  it("U: answer normalization correctly equates case/whitespace/outer-punctuation variants without over-normalizing", () => {
    expect(normalizeAnswer("  Laboratory.  ")).toBe("laboratory");
    expect(normalizeAnswer("NOT GIVEN")).toBe("not given");
    expect(answersMatch("laboratory", "Laboratory.")).toBe(true);
    // Internal punctuation/digits must NOT be stripped -- these are
    // deliberately DIFFERENT normalized values.
    expect(normalizeAnswer("well-known")).toBe("well-known");
    expect(normalizeAnswer("9:30")).toBe("9:30");
    expect(normalizeAnswer("don't")).toBe("don't");
    expect(normalizeAnswer("1990")).not.toBe(normalizeAnswer("1991"));
  });
});

// ── V: existing Placement/Practice tests remain unchanged ───────────────────
// (Executed as part of the full test-suite run in this task's final
// validation step, not duplicated here — this module doesn't import or
// touch src/lib/assessment or src/lib/practice at all.)

describe("assembly-time adapter (validateAssembledMock)", () => {
  function readingRow(overrides: Partial<AssembledQuestionRow>): AssembledQuestionRow {
    return {
      id: overrides.id ?? "row-1",
      skill: "reading",
      type: "multiple_choice",
      question: "Filler?",
      options: ["a", "b", "c"],
      correct_answer: "a",
      accepted_answers: null,
      answer_word_limit: null,
      option_pool: null,
      mock_group_id: null,
      mock_sequence: 1,
      difficulty: "B2",
      mock_passage_id: "p1",
      mock_listening_section_id: null,
      ...overrides,
    };
  }

  function fillerRows(count: number, parentId: string, startId = 1): AssembledQuestionRow[] {
    return Array.from({ length: count }, (_, i) =>
      readingRow({ id: `${parentId}-r${startId + i}`, mock_passage_id: parentId, mock_sequence: startId + i, question: `Q${startId + i}` }),
    );
  }

  it("re-hydrates flat rows into the same contract shape and validates a complete mock as valid", () => {
    const passages = [
      { id: "p1", title: "P1", difficulty: "B2" as const },
      { id: "p2", title: "P2", difficulty: "B2" as const },
      { id: "p3", title: "P3", difficulty: "B2" as const },
    ];
    const rows = [...fillerRows(14, "p1"), ...fillerRows(13, "p2"), ...fillerRows(13, "p3")];
    const sections = [
      { id: "s1", title: "S1", difficulty: "B2" as const },
      { id: "s2", title: "S2", difficulty: "B2" as const },
      { id: "s3", title: "S3", difficulty: "B2" as const },
      { id: "s4", title: "S4", difficulty: "B2" as const },
    ];
    const listeningRows = [
      ...fillerRows(10, "s1").map((r) => ({ ...r, skill: "listening" as const, mock_passage_id: null, mock_listening_section_id: "s1" })),
      ...fillerRows(10, "s2").map((r) => ({ ...r, skill: "listening" as const, mock_passage_id: null, mock_listening_section_id: "s2" })),
      ...fillerRows(10, "s3").map((r) => ({ ...r, skill: "listening" as const, mock_passage_id: null, mock_listening_section_id: "s3" })),
      ...fillerRows(10, "s4").map((r) => ({ ...r, skill: "listening" as const, mock_passage_id: null, mock_listening_section_id: "s4" })),
    ];

    const result = validateAssembledMock(passages, rows, sections, listeningRows);
    expect(result.valid).toBe(true);
  });

  it("flags INCONSISTENT_OPTION_POOL when rows sharing a mock_group_id carry different pools", () => {
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    const rowA = readingRow({ id: "r1", mock_group_id: "g1", type: "matching_headings", correct_answer: "A", option_pool: [{ id: "A", text: "Heading A" }] });
    const rowB = readingRow({ id: "r2", mock_group_id: "g1", type: "matching_headings", correct_answer: "A", option_pool: [{ id: "A", text: "Different heading text" }] });
    const { contract, errors } = buildReadingContractFromRows(passages, [rowA, rowB]);
    expect(contract.passages[0].questionGroups.length).toBe(1);
    expect(codesOf(errors)).toContain("INCONSISTENT_OPTION_POOL");
  });

  it("re-hydrated word limit label round-trips into a rejection when violated", () => {
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    const row = readingRow({ id: "r1", type: "sentence_completion", correct_answer: "way too many words here", answer_word_limit: "ONE_WORD" });
    const { contract } = buildReadingContractFromRows(passages, [row]);
    const result = validateReadingMock({ passages: [contract.passages[0], validPassage("p2", 13), validPassage("p3", 13)] });
    expect(codesOf(result.errors)).toContain("WORD_LIMIT_EXCEEDED");
  });

  it("validates Reading alone without manufacturing Listening count errors", () => {
    const passages = [
      { id: "p1", title: "P1", difficulty: "B2" as const },
      { id: "p2", title: "P2", difficulty: "B2" as const },
      { id: "p3", title: "P3", difficulty: "B2" as const },
    ];
    const rows = [...fillerRows(14, "p1"), ...fillerRows(13, "p2"), ...fillerRows(13, "p3")];

    const result = validateAssembledMock(passages, rows, [], [], { includeListening: false });

    expect(result.valid).toBe(true);
    expect(codesOf(result.errors)).not.toContain("WRONG_SECTION_COUNT");
  });

  it("rejects malformed jsonb option pools and accepted-answer arrays instead of throwing", () => {
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    const rows = [readingRow({
      type: "matching_headings",
      mock_group_id: "g1",
      option_pool: [{ id: "A" }],
      accepted_answers: ["valid", 42],
      correct_answer: "A",
    })];

    const { errors } = buildReadingContractFromRows(passages, rows);

    expect(codesOf(errors)).toContain("INVALID_OPTION_POOL");
    expect(codesOf(errors)).toContain("INVALID_ACCEPTED_ANSWERS");
  });

  it("rejects duplicate positive mock_sequence values within a passage", () => {
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    const rows = [
      readingRow({ id: "r1", mock_sequence: 1 }),
      readingRow({ id: "r2", mock_sequence: 1, question: "Different" }),
    ];

    const { errors } = buildReadingContractFromRows(passages, rows);

    expect(codesOf(errors)).toContain("DUPLICATE_MOCK_SEQUENCE");
  });

  it("keeps legacy null sequences valid and orders them deterministically by id", () => {
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    const { contract, errors } = buildReadingContractFromRows(passages, [
      readingRow({ id: "r-z", mock_sequence: null, question: "Z" }),
      readingRow({ id: "r-a", mock_sequence: null, question: "A" }),
    ]);

    expect(codesOf(errors)).not.toContain("INVALID_MOCK_SEQUENCE");
    expect(contract.passages[0].questionGroups.map((group) => group.questions[0].id)).toEqual(["r-a", "r-z"]);
  });
});

/**
 * READING REFERENCE CAPABILITY (docs/reading-ielts-reference-audit.md).
 *
 * Two content shapes the audited paper uses that the validator previously
 * rejected or mis-classified: Matching Information with letter reuse, and
 * Summary Completion driven by a word bank.
 */
describe("matching with letter reuse (NB You may use any letter more than once)", () => {
  function matchingGroup(answers: string[], poolIds: string[]) {
    return {
      groupId: "mi",
      taskType: "matching_information" as const,
      instructions: "Which paragraph contains the following information? NB You may use any letter more than once.",
      optionPool: poolIds.map((id) => ({ id, text: `Paragraph ${id}` })),
      questions: answers.map((a, i) => ({
        id: `mi-${i}`,
        skill: "reading" as const,
        type: "matching_information" as const,
        order: i + 1,
        questionText: `Statement ${i + 1}`,
        correctAnswer: a,
        difficulty: "B2" as const,
        structuralParentId: "p1",
        groupId: "mi",
      })),
    };
  }

  it("accepts 10 questions against a 9-letter pool when letters are reused -- the reference's own shape", () => {
    const group = matchingGroup(["A", "B", "C", "D", "E", "F", "G", "H", "I", "C"], ["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(errors).toEqual([]);
  });

  it("still rejects a pool smaller than the question count when every answer is distinct", () => {
    const group = matchingGroup(["A", "B", "C", "D"], ["A", "B", "C"]);
    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(errors.some((e) => e.code === "MATCHING_COUNT_MISMATCH")).toBe(true);
  });

  it("rejects reuse whose distinct answers still exceed the pool", () => {
    const group = matchingGroup(["A", "B", "C", "C"], ["A", "B"]);
    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(errors.some((e) => e.code === "MATCHING_COUNT_MISMATCH")).toBe(true);
  });

  it("still rejects an answer that is not in the pool, reuse or not", () => {
    const group = matchingGroup(["A", "B", "Z", "A"], ["A", "B", "C"]);
    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(errors.some((e) => e.code === "INVALID_POOL_REFERENCE")).toBe(true);
  });

  it("matching_features (researchers) works the same way, including reuse", () => {
    const group = {
      groupId: "mf",
      taskType: "matching_features" as const,
      instructions: "Match each statement with the correct researcher.",
      optionPool: [{ id: "A", text: "Researcher A" }, { id: "B", text: "Researcher B" }, { id: "C", text: "Researcher C" }],
      questions: ["A", "C", "A"].map((a, i) => ({
        id: `mf-${i}`, skill: "reading" as const, type: "matching_features" as const, order: i + 1,
        questionText: `Claim ${i + 1}`, correctAnswer: a, difficulty: "B2" as const,
        structuralParentId: "p2", groupId: "mf",
      })),
    };
    expect(validateQuestionGroup(group, { expectedParentId: "p2", expectedSkill: "reading" }, "p")).toEqual([]);
  });
});

describe("summary completion — word-bank variant", () => {
  function wordBankGroup(answers: string[], poolIds: string[], extra: Record<string, unknown> = {}) {
    return {
      groupId: "sc",
      taskType: "summary_completion" as const,
      instructions: "Complete the summary using the list of words, A-K, below.",
      optionPool: poolIds.map((id) => ({ id, text: `word ${id}` })),
      questions: answers.map((a, i) => ({
        id: `sc-${i}`, skill: "reading" as const, type: "summary_completion" as const, order: i + 1,
        questionText: `Gap ${i + 1}`, correctAnswer: a, difficulty: "B2" as const,
        structuralParentId: "p1", groupId: "sc", ...extra,
      })),
    };
  }

  it("isWordBankGroup distinguishes the two Summary Completion variants", () => {
    expect(isWordBankGroup({ taskType: "summary_completion", optionPool: [{ id: "A", text: "x" }] })).toBe(true);
    expect(isWordBankGroup({ taskType: "summary_completion" })).toBe(false);
    expect(isWordBankGroup({ taskType: "sentence_completion" })).toBe(false);
    // A matching task is not a word-bank completion even though it has a pool.
    expect(isWordBankGroup({ taskType: "matching_headings", optionPool: [{ id: "i", text: "x" }] })).toBe(false);
  });

  it("accepts letter answers with NO word limit -- the answer is a pool id, not passage text", () => {
    const group = wordBankGroup(["B", "J", "D"], ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
    expect(validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p")).toEqual([]);
  });

  it("rejects a word-bank answer that is not one of the supplied letters", () => {
    const group = wordBankGroup(["B", "Z"], ["A", "B", "C", "D"]);
    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(errors.some((e) => e.code === "INVALID_POOL_REFERENCE")).toBe(true);
  });

  it("requires a pool at least as large as the distinct letters used", () => {
    const group = wordBankGroup(["A", "B", "C"], ["A", "B"]);
    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(errors.some((e) => e.code === "INVALID_POOL_REFERENCE" || e.code === "MATCHING_COUNT_MISMATCH")).toBe(true);
  });

  it("rejects ambiguous word-bank metadata instead of treating it as free text", () => {
    const group = wordBankGroup(["A"], ["A", "B"], { wordLimit: { maxWords: 1, allowNumber: false }, acceptedAnswers: ["word A"] });
    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(codesOf(errors)).toContain("WORD_BANK_METADATA_CONFLICT");
  });

  it("rejects duplicate option-pool ids and a missing question group reference", () => {
    const group = wordBankGroup(["A"], ["A", "A"]);
    delete (group.questions[0] as { groupId?: string }).groupId;
    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(codesOf(errors)).toContain("INVALID_OPTION_POOL");
    expect(codesOf(errors)).toContain("MISSING_QUESTION_GROUP");
  });

  it("REGRESSION: free-text completion still requires a word limit and still enforces it", () => {
    const free = {
      groupId: "free",
      taskType: "sentence_completion" as const,
      instructions: "Complete the sentences below. Choose NO MORE THAN TWO WORDS.",
      questions: [{
        id: "free-1", skill: "reading" as const, type: "sentence_completion" as const, order: 1,
        questionText: "Gap", correctAnswer: "one two three", difficulty: "B2" as const,
        structuralParentId: "p1", groupId: "free", wordLimit: { maxWords: 2 as const, allowNumber: false },
      }],
    };
    const errors = validateQuestionGroup(free, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(errors.some((e) => e.code === "WORD_LIMIT_EXCEEDED")).toBe(true);

    const noLimit = {
      ...free,
      questions: [{ ...free.questions[0], correctAnswer: "ok", wordLimit: undefined }],
    };
    const errors2 = validateQuestionGroup(noLimit, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(errors2.some((e) => e.code === "INVALID_COMPLETION_ANSWER")).toBe(true);
  });
});

/**
 * GROUP INSTRUCTION PERSISTENCE — full round trip.
 *
 * Proves the task instruction survives every hop it has to make:
 *
 *   authoring contract -> validator -> insert row -> DB row shape
 *     -> rehydration (buildReadingContractFromRows) -> ClientQuestion
 *     -> runtime renderer
 *
 * The DB hop itself is represented by AssembledQuestionRow, which mirrors the
 * assessment_questions columns exactly. Nothing here touches a live database.
 */
describe("group instructions — round trip", () => {
  const INSTRUCTIONS =
    "Questions 1-4: Which paragraph contains the following information?\nNB You may use any letter more than once.";

  function row(overrides: Partial<AssembledQuestionRow>): AssembledQuestionRow {
    return {
      id: "row-1",
      skill: "reading",
      type: "matching_information",
      question: "A description of the method used.",
      options: null,
      correct_answer: "A",
      accepted_answers: null,
      answer_word_limit: null,
      option_pool: [{ id: "A", text: "Paragraph A" }, { id: "B", text: "Paragraph B" }],
      mock_group_id: "g1",
      mock_sequence: 1,
      difficulty: "B2",
      mock_passage_id: "p1",
      mock_listening_section_id: null,
      ...overrides,
    };
  }

  it("HOP 1-2: the authoring contract carries instructions and the validator accepts them", () => {
    const group: MockQuestionGroupContract = {
      groupId: "g1",
      taskType: "matching_information",
      instructions: INSTRUCTIONS,
      optionPool: [{ id: "A", text: "Paragraph A" }, { id: "B", text: "Paragraph B" }],
      questions: [
        { id: "q1", skill: "reading", type: "matching_information", order: 1, questionText: "Stmt 1", correctAnswer: "A", difficulty: "B2", structuralParentId: "p1", groupId: "g1" },
        { id: "q2", skill: "reading", type: "matching_information", order: 2, questionText: "Stmt 2", correctAnswer: "A", difficulty: "B2", structuralParentId: "p1", groupId: "g1" },
      ],
    };
    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(errors).toEqual([]);
  });

  it("HOP 3-5: an instruction persisted on the rows rehydrates into the contract", () => {
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    const rows = [
      row({ id: "r1", mock_sequence: 1, mock_group_instructions: INSTRUCTIONS }),
      row({ id: "r2", mock_sequence: 2, mock_group_instructions: INSTRUCTIONS }),
    ];
    const { contract } = buildReadingContractFromRows(passages, rows);
    const group = contract.passages[0].questionGroups[0];
    // This is the exact assertion that failed before the migration: the
    // rehydrator used to hardcode "".
    expect(group.instructions).toBe(INSTRUCTIONS);
    expect(group.instructions).toContain("NB You may use any letter more than once.");
  });

  it("survives a SECOND full round trip without drift", () => {
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    const first = buildReadingContractFromRows(passages, [row({ mock_group_instructions: INSTRUCTIONS })]);
    const rehydrated = first.contract.passages[0].questionGroups[0].instructions;
    // Feed the rehydrated value back through the insert mapping the seed script
    // uses (`g.instructions || null`) and rehydrate again.
    const second = buildReadingContractFromRows(passages, [row({ mock_group_instructions: rehydrated || null })]);
    expect(second.contract.passages[0].questionGroups[0].instructions).toBe(INSTRUCTIONS);
  });

  it("carries each of the four reference instruction forms verbatim", () => {
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    for (const text of [
      "Questions 1-4: Which paragraph contains the following information?",
      "NB You may use any letter more than once.",
      "Questions 5-10: Complete the summary below.",
      "Choose NO MORE THAN TWO WORDS from the passage.",
    ]) {
      const { contract } = buildReadingContractFromRows(passages, [row({ mock_group_instructions: text })]);
      expect(contract.passages[0].questionGroups[0].instructions).toBe(text);
    }
  });

  it("flags INCONSISTENT_GROUP_INSTRUCTIONS when rows in one group disagree", () => {
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    const rows = [
      row({ id: "r1", mock_sequence: 1, mock_group_instructions: INSTRUCTIONS }),
      row({ id: "r2", mock_sequence: 2, mock_group_instructions: "Something else entirely." }),
    ];
    const { errors } = buildReadingContractFromRows(passages, rows);
    expect(codesOf(errors)).toContain("INCONSISTENT_GROUP_INSTRUCTIONS");
  });

  it("treats a group with no instruction column as empty, not broken (pre-migration rows)", () => {
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    const { contract, errors } = buildReadingContractFromRows(passages, [row({})]);
    expect(contract.passages[0].questionGroups[0].instructions).toBe("");
    expect(codesOf(errors)).not.toContain("INCONSISTENT_GROUP_INSTRUCTIONS");
  });

  it("rejects instructions long enough to be pasted passage text", () => {
    const group: MockQuestionGroupContract = {
      groupId: "g1",
      taskType: "true_false_not_given",
      instructions: "x".repeat(601),
      questions: [
        { id: "q1", skill: "reading", type: "true_false_not_given", order: 1, questionText: "Stmt", correctAnswer: "TRUE", difficulty: "B2", structuralParentId: "p1", groupId: "g1" },
      ],
    };
    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(codesOf(errors)).toContain("INVALID_GROUP_INSTRUCTIONS");
  });

  it("accepts instructions for a group with NO option pool (TFNG, free-text completion)", () => {
    // The reason option_pool could not have carried this field.
    const passages = [{ id: "p1", title: "P1", difficulty: "B2" as const }];
    const { contract } = buildReadingContractFromRows(passages, [
      row({ type: "true_false_not_given", correct_answer: "TRUE", option_pool: null, mock_group_instructions: "Choose NO MORE THAN TWO WORDS from the passage." }),
    ]);
    const group = contract.passages[0].questionGroups[0];
    expect(group.optionPool).toBeUndefined();
    expect(group.instructions).toBe("Choose NO MORE THAN TWO WORDS from the passage.");
  });
});

describe("group contract consistency", () => {
  it("rejects a question whose type or group id disagrees with its containing group", () => {
    const group: MockQuestionGroupContract = {
      groupId: "g1",
      taskType: "true_false_not_given",
      instructions: "Choose TRUE, FALSE or NOT GIVEN.",
      questions: [{
        id: "q1",
        skill: "reading",
        type: "yes_no_not_given",
        order: 1,
        questionText: "Statement",
        correctAnswer: "YES",
        difficulty: "B2",
        structuralParentId: "p1",
        groupId: "different-group",
      }],
    };

    const errors = validateQuestionGroup(group, { expectedParentId: "p1", expectedSkill: "reading" }, "p");
    expect(codesOf(errors)).toContain("GROUP_TASK_TYPE_MISMATCH");
    expect(codesOf(errors)).toContain("WRONG_QUESTION_GROUP");
  });
});
