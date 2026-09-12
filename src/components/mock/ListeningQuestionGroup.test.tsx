import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListeningQuestionGroup } from "./ListeningQuestionGroup";
import type { ClientQuestion } from "./types";

function question(id: string, sequenceNumber: number): ClientQuestion {
  const optionPool = ["A", "B", "C", "D", "E"].map((optionId) => ({ id: optionId, text: `Option ${optionId}` }));
  return {
    id,
    skill: "listening",
    type: "multiple_choice",
    difficulty: "B2",
    passage: null,
    passageTitle: null,
    audioUrl: null,
    question: "Shared choose-two prompt",
    options: null,
    sequenceNumber,
    passageId: null,
    sectionId: "s2",
    optionPool,
    wordLimit: null,
    groupId: "g-two",
    groupInstructions: "Choose TWO answers.",
    mockSequence: sequenceNumber - 10,
    sectionInstruction: null,
    questionInstruction: null,
    audioInstruction: null,
  };
}

function count(value: string, search: string): number {
  return value.split(search).length - 1;
}

describe("ListeningQuestionGroup choose-two renderer", () => {
  it("renders one shared five-option multi-select and disables a third selection", () => {
    const html = renderToStaticMarkup(
      <ListeningQuestionGroup
        group={{
          key: "group:g-two",
          groupId: "g-two",
          instructions: "Choose TWO answers.",
          questions: [question("q11", 11), question("q12", 12)],
        }}
        currentQuestionId="q11"
        answers={{ q11: "B", q12: "D" }}
        flags={{}}
        onSelect={() => undefined}
        onChooseTwoChange={() => undefined}
        onNavigate={() => undefined}
        onToggleFlag={() => undefined}
      />,
    );

    expect(count(html, "Choose TWO answers.")).toBe(1);
    expect(count(html, 'role="checkbox"')).toBe(5);
    expect(count(html, 'aria-checked="true"')).toBe(2);
    expect(count(html, "disabled=\"\"")).toBe(3);
    expect(html).toContain("2/2 selected");
    expect(html).toContain("Deselect an answer before choosing a different option.");
  });
});
