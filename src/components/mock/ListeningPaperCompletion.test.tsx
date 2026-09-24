import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListeningSectionPanel } from "./ListeningSectionPanel";
import {
  isPaperCompletionGroup,
  paperCompletionLayout,
  parseCompletionStem,
} from "./ListeningPaperCompletion";
import { buildListeningSections, type ClientListeningQuestionGroup } from "./listening-state";
import type { ClientQuestion } from "./types";

const FORM = "Questions 1–7\nComplete the form below.\nWrite ONE WORD AND/OR A NUMBER for each answer.";
const TABLE = "Questions 8–10\nComplete the table below.\nWrite NO MORE THAN TWO WORDS for each answer.";

function question(sequenceNumber: number, sectionId: string, patch: Partial<ClientQuestion> = {}): ClientQuestion {
  const inForm = sequenceNumber <= 7;
  return {
    id: `q${sequenceNumber}`,
    skill: "listening",
    type: "form_note_table_flowchart_summary_completion",
    difficulty: "B1",
    passage: null,
    passageTitle: null,
    audioUrl: null,
    question: `Field ${sequenceNumber}: ___`,
    options: null,
    sequenceNumber,
    passageId: null,
    sectionId,
    optionPool: null,
    wordLimit: { maxWords: inForm ? 1 : 2, allowNumber: inForm },
    groupId: inForm ? "ls1-form" : "ls1-table",
    groupInstructions: inForm ? FORM : TABLE,
    mockSequence: sequenceNumber,
    sectionInstruction: null,
    questionInstruction: null,
    audioInstruction: null,
    ...patch,
  };
}

function renderSection(sectionNumber: number, questions: ClientQuestion[], answers: Record<string, string | null> = {}) {
  const sectionId = questions[0].sectionId ?? "s";
  const [section] = buildListeningSections(
    [sectionId],
    questions,
    [{ id: sectionId, title: "Craft fair booking", audioUrl: `/${sectionId}.mp3` }],
  );
  return renderToStaticMarkup(
    <ListeningSectionPanel
      section={section}
      sectionNumber={sectionNumber}
      currentQuestionId={questions[0].id}
      answers={answers}
      flags={{ q3: true }}
      audioAlreadyPlayed={false}
      onAudioPlay={() => undefined}
      onSelect={() => undefined}
      onChooseTwoChange={() => undefined}
      onNavigate={() => undefined}
      onToggleFlag={() => undefined}
    />,
  );
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function group(questions: ClientQuestion[]): ClientListeningQuestionGroup {
  return { key: "g", groupId: "g", instructions: null, questions };
}

describe("parseCompletionStem", () => {
  it("splits a form label from its blank", () => {
    expect(parseCompletionStem("Name: ___")).toEqual({ before: "Name:", label: "Name:", lead: "", after: "" });
  });

  it("keeps a prefix and unit beside the blank", () => {
    expect(parseCompletionStem("Stall fee: £___ per day")).toEqual({
      before: "Stall fee: £",
      label: "Stall fee:",
      lead: "£",
      after: "per day",
    });
  });

  it("handles sentence stems, ellipsis markers and stems without a marker", () => {
    expect(parseCompletionStem("Set-up starts at …… a.m.")).toMatchObject({ label: "Set-up starts at", after: "a.m." });
    expect(parseCompletionStem("Postcode")).toEqual({ before: "Postcode", label: "Postcode", lead: "", after: "" });
  });
});

describe("paper layout selection", () => {
  it("reads the structure from the authored instruction", () => {
    expect(paperCompletionLayout(FORM)).toBe("form");
    expect(paperCompletionLayout(TABLE)).toBe("table");
    expect(paperCompletionLayout("Complete the notes below.")).toBe("notes");
    expect(paperCompletionLayout("Complete the sentences below.")).toBe("sentences");
    expect(paperCompletionLayout(null)).toBe("form");
  });

  it("accepts only free-text completion groups", () => {
    expect(isPaperCompletionGroup(group([question(1, "s1")]))).toBe(true);
    expect(isPaperCompletionGroup(group([question(1, "s1", { optionPool: [{ id: "A", text: "x" }] })]))).toBe(false);
    expect(isPaperCompletionGroup(group([question(1, "s1", { type: "multiple_choice" })]))).toBe(false);
  });
});

describe("Listening Section 1 paper layout", () => {
  const sectionOne = Array.from({ length: 10 }, (_, index) => question(index + 1, "s1"));

  it("renders Q1-Q10 in order as two continuous group blocks", () => {
    const html = renderSection(1, sectionOne, { q1: "baskets", q8: "market square" });

    const order = [...html.matchAll(/id="listening-question-(\d+)"/g)].map((match) => Number(match[1]));
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(count(html, "Question group ls1-form")).toBe(1);
    expect(count(html, "Question group ls1-table")).toBe(1);
    expect(count(html, 'data-testid="listening-paper-form"')).toBe(1);
    expect(count(html, 'data-testid="listening-paper-table"')).toBe(1);
    expect(count(html, 'type="text"')).toBe(10);
    expect(html).toContain('value="baskets"');
    expect(html).toContain('value="market square"');
  });

  it("shows each group instruction once and no per-question card chrome", () => {
    const html = renderSection(1, sectionOne);

    expect(count(html, "Complete the form below.")).toBe(1);
    expect(count(html, "Complete the table below.")).toBe(1);
    expect(count(html, "<strong")).toBe(2);
    expect(html).not.toContain("for this answer.");
    expect(html).not.toContain("Type your answer");
    expect(html).not.toContain("rounded-2xl border border-border/80 bg-bg-card p-5");
  });

  it("labels every blank with its question number and stem, and keeps flag controls", () => {
    const html = renderSection(1, sectionOne);

    for (let number = 1; number <= 10; number += 1) {
      expect(html).toContain(`aria-labelledby="listening-q${number}-number listening-q${number}-before"`);
      expect(html).toMatch(new RegExp(`id="listening-q${number}-number"[^>]*><span class="sr-only">Question </span>${number}<`));
    }
    expect(html).toContain('aria-label="Unflag question 3"');
    expect(html).toContain('aria-label="Flag question 1"');
    expect(html).toContain("<span class=\"sr-only\">Listening </span>Section 1</h1>");
  });

  it("leaves other sections on the existing card layout", () => {
    const sectionFour = Array.from({ length: 10 }, (_, index) =>
      question(31 + index, "s4", { groupId: index < 5 ? "ls4-a" : "ls4-b", groupInstructions: "Complete the notes below." }));
    const html = renderSection(4, sectionFour);

    expect(html).not.toContain("listening-paper-");
    expect(html).toContain("Question 31");
    expect(html).toContain("Listening Section 4");
  });
});
