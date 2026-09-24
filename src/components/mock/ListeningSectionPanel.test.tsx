import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListeningSectionPanel } from "./ListeningSectionPanel";
import type { ClientQuestion } from "./types";
import { buildListeningSections } from "./listening-state";

function question(sequenceNumber: number, groupId: string, instructions: string): ClientQuestion {
  return {
    id: `q${sequenceNumber}`,
    skill: "listening",
    type: "note_completion",
    difficulty: "B1",
    passage: null,
    passageTitle: null,
    audioUrl: null,
    question: `Prompt ${sequenceNumber}`,
    options: null,
    sequenceNumber,
    passageId: null,
    sectionId: "section-1",
    optionPool: null,
    wordLimit: { maxWords: 2, allowNumber: true },
    groupId,
    groupInstructions: instructions,
    mockSequence: sequenceNumber,
    sectionInstruction: null,
    questionInstruction: null,
    audioInstruction: null,
  };
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("ListeningSectionPanel", () => {
  it("represents exactly one audio player for the active section", () => {
    const questions = Array.from({ length: 10 }, (_, index) =>
      question(index + 1, index < 7 ? "form" : "table", index < 7 ? "Complete the form." : "Complete the table."),
    );
    const [section] = buildListeningSections(
      ["section-1"],
      questions,
      [{ id: "section-1", title: "Registration", audioUrl: "/section-1.mp3" }],
    );

    const html = renderToStaticMarkup(
      <ListeningSectionPanel
        section={section}
        sectionNumber={1}
        currentQuestionId="q1"
        answers={{ q1: "Alice" }}
        flags={{ q8: true }}
        audioAlreadyPlayed={false}
        onAudioPlay={() => undefined}
        onSelect={() => undefined}
        onChooseTwoChange={() => undefined}
        onNavigate={() => undefined}
        onToggleFlag={() => undefined}
      />,
    );

    expect(count(html, "Audio recording")).toBe(1);
    expect(count(html, "Complete the form.")).toBe(1);
    expect(count(html, "Complete the table.")).toBe(1);
    expect(count(html, "Question group form")).toBe(1);
    expect(count(html, "Question group table")).toBe(1);
    expect(html).toContain("Question 1");
    expect(html).toContain("Question 10");
  });
});
