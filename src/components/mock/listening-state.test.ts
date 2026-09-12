import { describe, expect, it } from "vitest";
import type { ClientQuestion } from "./types";
import {
  buildListeningSections,
  flattenListeningQuestions,
  getListeningLocation,
} from "./listening-state";

function question(sequenceNumber: number, sectionId: string, groupId: string): ClientQuestion {
  return {
    id: `q${sequenceNumber}`,
    skill: "listening",
    type: "note_completion",
    difficulty: "B1",
    passage: null,
    passageTitle: null,
    audioUrl: null,
    question: `Question ${sequenceNumber}`,
    options: null,
    sequenceNumber,
    passageId: null,
    sectionId,
    optionPool: null,
    wordLimit: { maxWords: 2, allowNumber: true },
    groupId,
    groupInstructions: groupId === "form" ? "Complete the form." : groupId === "table" ? "Complete the table." : null,
    mockSequence: ((sequenceNumber - 1) % 10) + 1,
    sectionInstruction: null,
    questionInstruction: null,
    audioInstruction: null,
  };
}

function runtime() {
  const sectionIds = ["s1", "s2", "s3", "s4"];
  const questions = sectionIds.flatMap((sectionId, sectionIndex) =>
    Array.from({ length: 10 }, (_, index) => {
      const number = sectionIndex * 10 + index + 1;
      const groupId = sectionId === "s1" ? (index < 7 ? "form" : "table") : `${sectionId}-group`;
      return question(number, sectionId, groupId);
    }),
  );
  const sections = buildListeningSections(
    sectionIds,
    questions,
    sectionIds.map((id) => ({ id, title: `Section ${id.slice(1)}`, audioUrl: `/${id}.mp3` })),
  );
  return { questions, sections };
}

describe("Listening section runtime model", () => {
  it("keeps Q1 and Q2 in the same section with the same audio identity", () => {
    const { sections } = runtime();
    const q1 = getListeningLocation(sections, 0);
    const q2 = getListeningLocation(sections, 1);

    expect(q1?.section).toBe(q2?.section);
    expect(q1?.section.audioUrl).toBe("/s1.mp3");
    expect(q2?.section.audioUrl).toBe("/s1.mp3");
  });

  it("moves Q10 to Q11 from Section 1 to Section 2", () => {
    const { sections } = runtime();
    expect(getListeningLocation(sections, 9)?.section.sectionId).toBe("s1");
    expect(getListeningLocation(sections, 10)?.section.sectionId).toBe("s2");
  });

  it("moves Q11 back to Q10 from Section 2 to Section 1", () => {
    const { sections } = runtime();
    expect(getListeningLocation(sections, 10)?.section.sectionId).toBe("s2");
    expect(getListeningLocation(sections, 9)?.section.sectionId).toBe("s1");
  });

  it("preserves section order, global question order, and block alignment", () => {
    const { questions, sections } = runtime();
    expect(sections.map((section) => section.sectionId)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(sections.map((section) => section.orderedQuestions.map((item) => item.id))).toEqual([
      questions.slice(0, 10).map((item) => item.id),
      questions.slice(10, 20).map((item) => item.id),
      questions.slice(20, 30).map((item) => item.id),
      questions.slice(30, 40).map((item) => item.id),
    ]);
    expect(flattenListeningQuestions(sections).map((item) => item.id)).toEqual(questions.map((item) => item.id));
  });

  it("models Section 1 as one Q1-7 group and one Q8-10 group", () => {
    const { sections } = runtime();
    expect(sections[0].questionGroups).toHaveLength(2);
    expect(sections[0].questionGroups[0].questions.map((item) => item.sequenceNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(sections[0].questionGroups[1].questions.map((item) => item.sequenceNumber)).toEqual([8, 9, 10]);
    expect(sections[0].questionGroups.map((group) => group.instructions)).toEqual([
      "Complete the form.",
      "Complete the table.",
    ]);
  });

  it("does not alter the persisted answer hydration shape", () => {
    const { sections } = runtime();
    const savedAnswers: Record<string, string | null> = { q1: "Alice", q8: "Tuesday", q10: null };
    const hydrated = Object.fromEntries(
      flattenListeningQuestions(sections).map((item) => [item.id, savedAnswers[item.id] ?? null]),
    );
    expect(hydrated.q1).toBe("Alice");
    expect(hydrated.q8).toBe("Tuesday");
    expect(hydrated.q10).toBeNull();
  });
});
