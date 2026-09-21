import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ListeningFlowchartGroup } from "./ListeningFlowchartGroup";
import { ListeningQuestionGroup } from "./ListeningQuestionGroup";
import type { ClientListeningQuestionGroup } from "./listening-state";
import type { ClientQuestion } from "./types";

const optionPool = ["A", "B", "C", "D", "E", "F", "G"].map((id) => ({
  id,
  text: `Method ${id}`,
}));

function flowchartQuestion(sequenceNumber: number, mockSequence = sequenceNumber): ClientQuestion {
  return {
    id: `q${sequenceNumber}`,
    skill: "listening",
    type: "form_note_table_flowchart_summary_completion",
    difficulty: "B2",
    passage: null,
    passageTitle: null,
    audioUrl: null,
    question: `Stage ${sequenceNumber}`,
    options: null,
    sequenceNumber,
    passageId: null,
    sectionId: "section-3",
    optionPool,
    wordLimit: null,
    groupId: "ls3-flowchart",
    groupInstructions: "Questions 21–25\nComplete the flow chart.",
    mockSequence,
    sectionInstruction: null,
    questionInstruction: null,
    audioInstruction: null,
  };
}

function flowchartGroup(): ClientListeningQuestionGroup {
  return {
    key: "group:ls3-flowchart",
    groupId: "ls3-flowchart",
    instructions: "Questions 21–25\nComplete the flow chart.",
    questions: [
      flowchartQuestion(24, 24),
      flowchartQuestion(21, 21),
      flowchartQuestion(25, 25),
      flowchartQuestion(23, 23),
      flowchartQuestion(22, 22),
    ],
  };
}

function count(value: string, search: string): number {
  return value.split(search).length - 1;
}

type TraversedElement = ReactElement<{
  children?: ReactNode;
  onChange?: (event: { target: { value: string } }) => void;
}>;

function elements(node: ReactNode): TraversedElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as TraversedElement;
  return [element, ...elements(element.props.children)];
}

const sharedProps = {
  currentQuestionId: "q21",
  flags: {},
  onChooseTwoChange: () => undefined,
  onToggleFlag: () => undefined,
};

describe("ListeningFlowchartGroup", () => {
  it("renders one instruction and one shared A–G bank with ordered global stages", () => {
    const html = renderToStaticMarkup(
      <ListeningQuestionGroup
        {...sharedProps}
        group={flowchartGroup()}
        answers={{}}
        onSelect={() => undefined}
        onNavigate={() => undefined}
      />,
    );

    expect(count(html, "Complete the flow chart.")).toBe(1);
    expect(count(html, 'data-testid="listening-flowchart-option-bank"')).toBe(1);
    for (const option of optionPool) {
      expect(count(html, `Method ${option.id}`)).toBe(1);
    }
    for (let number = 21; number <= 25; number += 1) {
      expect(html).toContain(`Question ${number}`);
    }
    expect(html.indexOf("Stage 21")).toBeLessThan(html.indexOf("Stage 22"));
    expect(html.indexOf("Stage 22")).toBeLessThan(html.indexOf("Stage 23"));
    expect(html.indexOf("Stage 23")).toBeLessThan(html.indexOf("Stage 24"));
    expect(html.indexOf("Stage 24")).toBeLessThan(html.indexOf("Stage 25"));
  });

  it("hydrates saved answers into the independent stage slots", () => {
    const html = renderToStaticMarkup(
      <ListeningQuestionGroup
        {...sharedProps}
        group={flowchartGroup()}
        answers={{ q21: "B", q22: "F", q23: "B" }}
        onSelect={() => undefined}
        onNavigate={() => undefined}
      />,
    );

    expect(html).toContain('<option value="B" selected="">B</option>');
    expect(html).toContain('<option value="F" selected="">F</option>');
    expect(count(html, '<option value="B" selected="">B</option>')).toBe(2);
  });

  it("uses the existing per-question answer callback and permits letter reuse", () => {
    const onSelect = vi.fn();
    const onNavigate = vi.fn();
    const tree = ListeningFlowchartGroup({
      group: flowchartGroup(),
      currentQuestionId: "q21",
      answers: {},
      flags: {},
      onSelect,
      onNavigate,
      onToggleFlag: () => undefined,
    });
    const selects = elements(tree).filter((element) => element.type === "select");

    expect(selects).toHaveLength(5);
    selects[0].props.onChange?.({ target: { value: "C" } });
    selects[1].props.onChange?.({ target: { value: "D" } });
    selects[2].props.onChange?.({ target: { value: "C" } });

    expect(onSelect.mock.calls).toEqual([
      ["q21", "C"],
      ["q22", "D"],
      ["q23", "C"],
    ]);
    expect(onNavigate.mock.calls).toEqual([["q21"], ["q22"], ["q23"]]);
  });

  it("leaves ordinary matching and choose-two groups on their existing render paths", () => {
    const matchingQuestions = [21, 22].map((number) => ({
      ...flowchartQuestion(number),
      type: "matching" as const,
      groupId: "matching-group",
    }));
    const matchingHtml = renderToStaticMarkup(
      <ListeningQuestionGroup
        {...sharedProps}
        group={{ key: "group:matching", groupId: "matching-group", instructions: "Match each item.", questions: matchingQuestions }}
        answers={{}}
        onSelect={() => undefined}
        onNavigate={() => undefined}
      />,
    );
    expect(matchingHtml).not.toContain("listening-flowchart-option-bank");
    expect(count(matchingHtml, "Method A")).toBe(2);

    const chooseTwoQuestions = [21, 22].map((number) => ({
      ...flowchartQuestion(number),
      type: "multiple_choice" as const,
      groupId: "choose-two-group",
      optionPool: optionPool.slice(0, 5),
    }));
    const chooseTwoHtml = renderToStaticMarkup(
      <ListeningQuestionGroup
        {...sharedProps}
        group={{ key: "group:choose-two", groupId: "choose-two-group", instructions: "Choose TWO answers.", questions: chooseTwoQuestions }}
        answers={{ q21: "A", q22: "C" }}
        onSelect={() => undefined}
        onNavigate={() => undefined}
      />,
    );
    expect(chooseTwoHtml).not.toContain("listening-flowchart-option-bank");
    expect(count(chooseTwoHtml, 'role="checkbox"')).toBe(5);
    expect(count(chooseTwoHtml, 'aria-checked="true"')).toBe(2);
  });
});
