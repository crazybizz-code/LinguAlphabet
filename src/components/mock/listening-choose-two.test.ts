import { describe, expect, it } from "vitest";
import type { ClientQuestion } from "./types";
import type { ClientListeningQuestionGroup } from "./listening-state";
import {
  encodeChooseTwoResponses,
  hydrateChooseTwoSelections,
  toggleChooseTwoSelection,
} from "./listening-choose-two";

const pool = ["A", "B", "C", "D", "E"].map((id) => ({ id, text: `Option ${id}` }));

function question(id: string, sequenceNumber: number): ClientQuestion {
  return {
    id,
    skill: "listening",
    type: "multiple_choice",
    difficulty: "B2",
    passage: null,
    passageTitle: null,
    audioUrl: null,
    question: "Which TWO facilities are included?",
    options: null,
    sequenceNumber,
    passageId: null,
    sectionId: "s2",
    optionPool: pool,
    wordLimit: null,
    groupId: "choose-two",
    groupInstructions: "Choose TWO letters, A-E.",
    mockSequence: sequenceNumber - 10,
    sectionInstruction: null,
    questionInstruction: null,
    audioInstruction: null,
  };
}

function group(): ClientListeningQuestionGroup {
  return {
    key: "group:choose-two",
    groupId: "choose-two",
    instructions: "Choose TWO letters, A-E.",
    questions: [question("q11", 11), question("q12", 12)],
  };
}

describe("Listening choose-two state and persistence", () => {
  it("selects a first option", () => {
    expect(toggleChooseTwoSelection(group(), [], "D")).toEqual(["D"]);
  });

  it("selects a second option and normalizes it to pool order", () => {
    expect(toggleChooseTwoSelection(group(), ["D"], "B")).toEqual(["B", "D"]);
  });

  it("prevents selecting a third option", () => {
    expect(toggleChooseTwoSelection(group(), ["B", "D"], "A")).toEqual(["B", "D"]);
  });

  it("deselects an already-selected option", () => {
    expect(toggleChooseTwoSelection(group(), ["B", "D"], "B")).toEqual(["D"]);
  });

  it("persists pool-ordered selections to sequence-ordered rows", () => {
    const reversed = group();
    reversed.questions.reverse();
    expect(encodeChooseTwoResponses(reversed, ["D", "B"])).toEqual([
      { questionId: "q11", sequenceNumber: 11, answer: "B" },
      { questionId: "q12", sequenceNumber: 12, answer: "D" },
    ]);
  });

  it("persists one selection to the first row and clears the second", () => {
    expect(encodeChooseTwoResponses(group(), ["C"])).toEqual([
      { questionId: "q11", sequenceNumber: 11, answer: "C" },
      { questionId: "q12", sequenceNumber: 12, answer: null },
    ]);
  });

  it("clears both rows when both selections are removed", () => {
    expect(encodeChooseTwoResponses(group(), [])).toEqual([
      { questionId: "q11", sequenceNumber: 11, answer: null },
      { questionId: "q12", sequenceNumber: 12, answer: null },
    ]);
  });

  it("hydrates a selection set from two persisted rows regardless of row value order", () => {
    expect(hydrateChooseTwoSelections(group(), { q11: "D", q12: "B" })).toEqual(["B", "D"]);
  });

  it("hydrates one selected row and one null row", () => {
    expect(hydrateChooseTwoSelections(group(), { q11: "C", q12: null })).toEqual(["C"]);
  });

  it("hydrates two null rows as an empty selection", () => {
    expect(hydrateChooseTwoSelections(group(), { q11: null, q12: null })).toEqual([]);
  });
});
