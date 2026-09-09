import { describe, it, expect } from "vitest";
import type { ReactNode } from "react";
import { QuestionRenderer } from "./QuestionRenderer";
import type { ClientQuestion } from "./types";

/**
 * MOCK 13-TYPE RENDER PATH.
 *
 * The "node" vitest environment has no DOM, so these tests call the
 * component as a function and walk the returned element graph directly --
 * the same approach src/lib/tuto-chat/markdown.test.tsx already uses.
 */

interface ElementLike {
  type: unknown;
  props?: { children?: ReactNode; onClick?: () => void; value?: string; [k: string]: unknown };
}

function walk(node: ReactNode, visit: (el: ElementLike) => void): void {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) return node.forEach((c) => walk(c, visit));
  if (typeof node === "string" || typeof node === "number") return;
  const el = node as unknown as ElementLike;
  visit(el);
  walk(el.props?.children as ReactNode, visit);
}

/** Renders the component tree, expanding nested function components so the
 * host elements inside ChoiceList/QuestionStem are reachable. */
function render(node: ReactNode): ElementLike[] {
  const flat: ElementLike[] = [];
  walk(node, (el) => {
    flat.push(el);
    if (typeof el.type === "function") {
      const inner = (el.type as (p: unknown) => ReactNode)(el.props ?? {});
      walk(inner, (child) => flat.push(child));
    }
  });
  return flat;
}

function text(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  const el = node as unknown as ElementLike;
  if (typeof el.type === "function") {
    return text((el.type as (p: unknown) => ReactNode)(el.props ?? {}));
  }
  return text(el.props?.children as ReactNode);
}

function baseQuestion(over: Partial<ClientQuestion>): ClientQuestion {
  return {
    id: "q1",
    skill: "reading",
    type: "multiple_choice",
    difficulty: "B2",
    passage: null,
    passageTitle: null,
    audioUrl: null,
    question: "What is the main idea?",
    options: null,
    sequenceNumber: 1,
    passageId: null,
    sectionId: null,
    optionPool: null,
    wordLimit: null,
    groupId: null,
    groupInstructions: null,
    mockSequence: null,
    sectionInstruction: null,
    questionInstruction: null,
    audioInstruction: null,
    ...over,
  };
}

/** Clicks the choice button whose visible text matches, returning what the
 * component passed to onSelect -- i.e. the value that would be persisted. */
function clickChoice(question: ClientQuestion, label: string): string | null {
  let submitted: string | null = null;
  const tree = QuestionRenderer({
    question,
    selectedAnswer: null,
    onSelect: (_id, answer) => {
      submitted = answer;
    },
  });
  const buttons = render(tree).filter((el) => el.type === "button");
  const target = buttons.find((b) => text(b.props?.children as ReactNode).includes(label));
  if (!target) throw new Error(`No choice button containing "${label}". Found: ${buttons.map((b) => text(b.props?.children as ReactNode)).join(" | ")}`);
  target.props?.onClick?.();
  return submitted;
}

function choiceTexts(question: ClientQuestion): string[] {
  const tree = QuestionRenderer({ question, selectedAnswer: null, onSelect: () => {} });
  return render(tree)
    .filter((el) => el.type === "button")
    .map((b) => text(b.props?.children as ReactNode).trim());
}

describe("QuestionRenderer — multiple_choice family", () => {
  it("renders one button per option and submits the option text (unchanged behaviour)", () => {
    const q = baseQuestion({ type: "multiple_choice", options: ["Alpha", "Beta", "Gamma"] });
    expect(choiceTexts(q)).toEqual(["A Alpha", "B Beta", "C Gamma"]);
    expect(clickChoice(q, "Beta")).toBe("Beta");
  });

  it("legacy 'mc' questions render and submit exactly as before", () => {
    const q = baseQuestion({ type: "mc", options: ["One", "Two"] });
    expect(choiceTexts(q)).toEqual(["A One", "B Two"]);
    expect(clickChoice(q, "Two")).toBe("Two");
  });

  it("legacy 'tf' questions still use their stored options", () => {
    const q = baseQuestion({ type: "tf", options: ["True", "False"] });
    expect(choiceTexts(q)).toEqual(["A True", "B False"]);
    expect(clickChoice(q, "False")).toBe("False");
  });
});

describe("QuestionRenderer — true_false_style family", () => {
  it("true_false_not_given renders True / False / Not Given even though the row has no options", () => {
    const q = baseQuestion({ type: "true_false_not_given", options: null });
    expect(choiceTexts(q)).toEqual(["A True", "B False", "C Not Given"]);
  });

  it("true_false_not_given submits the chosen literal", () => {
    const q = baseQuestion({ type: "true_false_not_given", options: null });
    expect(clickChoice(q, "Not Given")).toBe("Not Given");
  });

  it("yes_no_not_given renders Yes / No / Not Given", () => {
    const q = baseQuestion({ type: "yes_no_not_given", options: null });
    expect(choiceTexts(q)).toEqual(["A Yes", "B No", "C Not Given"]);
    expect(clickChoice(q, "No")).toBe("No");
  });

  it("regression: neither type renders an empty choice list (the pre-fix defect)", () => {
    for (const type of ["true_false_not_given", "yes_no_not_given"] as const) {
      expect(choiceTexts(baseQuestion({ type, options: null })).length).toBe(3);
    }
  });
});

describe("QuestionRenderer — matching_style family", () => {
  const pool = [
    { id: "i", text: "The rise of urban farming" },
    { id: "ii", text: "A surprising side effect" },
    { id: "iii", text: "Costs and benefits" },
  ];

  it("renders the shared option pool", () => {
    const q = baseQuestion({ type: "matching_headings", optionPool: pool });
    expect(choiceTexts(q)).toEqual([
      "i The rise of urban farming",
      "ii A surprising side effect",
      "iii Costs and benefits",
    ]);
  });

  it("submits the pool ITEM ID, never its display text", () => {
    const q = baseQuestion({ type: "matching_headings", optionPool: pool });
    expect(clickChoice(q, "A surprising side effect")).toBe("ii");
  });

  it("applies to every matching-family type, including listening-only ones", () => {
    for (const type of ["matching_information", "matching_features", "matching_sentence_endings", "matching", "plan_map_diagram_labeling"] as const) {
      const q = baseQuestion({ type, skill: type === "matching" || type === "plan_map_diagram_labeling" ? "listening" : "reading", optionPool: pool });
      expect(clickChoice(q, "Costs and benefits")).toBe("iii");
    }
  });

  it("degrades safely when the pool is missing rather than rendering a dead question", () => {
    const q = baseQuestion({ type: "matching_headings", optionPool: null });
    const rendered = text(QuestionRenderer({ question: q, selectedAnswer: null, onSelect: () => {} }));
    expect(rendered).toContain("No options available");
  });
});

describe("QuestionRenderer — completion family", () => {
  it("shows the word-limit guidance in real IELTS wording", () => {
    const q = baseQuestion({ type: "sentence_completion", wordLimit: { maxWords: 2, allowNumber: false } });
    expect(text(QuestionRenderer({ question: q, selectedAnswer: null, onSelect: () => {} })))
      .toContain("Write NO MORE THAN TWO WORDS for this answer.");
  });

  it("includes AND/OR A NUMBER when the limit allows it", () => {
    const q = baseQuestion({ type: "note_completion", wordLimit: { maxWords: 3, allowNumber: true } });
    expect(text(QuestionRenderer({ question: q, selectedAnswer: null, onSelect: () => {} })))
      .toContain("Write NO MORE THAN THREE WORDS AND/OR A NUMBER for this answer.");
  });

  it("warns when the typed answer exceeds the limit", () => {
    const q = baseQuestion({ type: "summary_completion", wordLimit: { maxWords: 2, allowNumber: false } });
    // text() joins JSX children with spaces, so normalise before matching.
    const rendered = text(QuestionRenderer({ question: q, selectedAnswer: "far too many words here", onSelect: () => {} })).replace(/\s+/g, " ");
    expect(rendered).toContain("5 words — over the 2 -word limit");
    expect(rendered).toContain("marked wrong");
  });

  it("does not warn when the answer is within the limit", () => {
    const q = baseQuestion({ type: "summary_completion", wordLimit: { maxWords: 2, allowNumber: false } });
    const rendered = text(QuestionRenderer({ question: q, selectedAnswer: "two words", onSelect: () => {} }));
    expect(rendered).not.toContain("over the");
  });

  it("renders a text input (not a choice list) and no guidance when no limit is declared", () => {
    const q = baseQuestion({ type: "fill", wordLimit: null });
    const flat = render(QuestionRenderer({ question: q, selectedAnswer: null, onSelect: () => {} }));
    expect(flat.some((el) => el.type === "input")).toBe(true);
    expect(flat.filter((el) => el.type === "button")).toHaveLength(0);
  });

  it("legacy 'fill' still routes to the text input", () => {
    const q = baseQuestion({ type: "fill" });
    const flat = render(QuestionRenderer({ question: q, selectedAnswer: null, onSelect: () => {} }));
    expect(flat.some((el) => el.type === "input")).toBe(true);
  });
});

describe("QuestionRenderer — anti-cheat", () => {
  it("ClientQuestion carries no answer fields, so nothing answer-shaped can be rendered", () => {
    const q = baseQuestion({ type: "matching_headings", optionPool: [{ id: "A", text: "Heading" }] });
    expect(q).not.toHaveProperty("correctAnswer");
    expect(q).not.toHaveProperty("acceptedAnswers");
    expect(q).not.toHaveProperty("explanation");
    const rendered = text(QuestionRenderer({ question: q, selectedAnswer: null, onSelect: () => {} }));
    expect(rendered).not.toMatch(/correctAnswer|acceptedAnswers/);
  });
});

/**
 * READING REFERENCE TASK TYPES (docs/reading-ielts-reference-audit.md §4).
 * Matching Information and Matching Features render from the shared pool;
 * word-bank Summary Completion must render as letter choices, NOT free text.
 */
describe("QuestionRenderer — Matching Information", () => {
  const paragraphs = ["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((id) => ({ id, text: `Paragraph ${id}` }));

  it("renders one choice per paragraph letter", () => {
    const q = baseQuestion({ type: "matching_information", optionPool: paragraphs });
    expect(choiceTexts(q)).toHaveLength(9);
    expect(choiceTexts(q)[0]).toBe("A Paragraph A");
  });

  it("submits the paragraph letter", () => {
    const q = baseQuestion({ type: "matching_information", optionPool: paragraphs });
    expect(clickChoice(q, "Paragraph E")).toBe("E");
  });

  it("the same letter can be chosen for different questions -- reuse is not blocked in the UI", () => {
    const a = baseQuestion({ id: "qa", type: "matching_information", optionPool: paragraphs });
    const b = baseQuestion({ id: "qb", type: "matching_information", optionPool: paragraphs });
    expect(clickChoice(a, "Paragraph C")).toBe("C");
    expect(clickChoice(b, "Paragraph C")).toBe("C");
  });
});

describe("QuestionRenderer — Matching Features / Researchers", () => {
  const people = [
    { id: "A", text: "Richard Karban" },
    { id: "B", text: "Ariel Novoplansky" },
    { id: "C", text: "David Johnson" },
    { id: "D", text: "Monica Gagliano" },
  ];

  it("renders the list of researchers and submits the letter", () => {
    const q = baseQuestion({ type: "matching_features", optionPool: people });
    expect(choiceTexts(q)).toEqual(["A Richard Karban", "B Ariel Novoplansky", "C David Johnson", "D Monica Gagliano"]);
    expect(clickChoice(q, "David Johnson")).toBe("C");
  });
});

describe("QuestionRenderer — Summary Completion word bank", () => {
  const bank = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((id) => ({ id, text: `word-${id}` }));

  it("renders letter choices, not a text input", () => {
    const q = baseQuestion({ type: "summary_completion", optionPool: bank, wordLimit: null });
    const flat = render(QuestionRenderer({ question: q, selectedAnswer: null, onSelect: () => {} }));
    expect(flat.some((el) => el.type === "input")).toBe(false);
    expect(flat.filter((el) => el.type === "button")).toHaveLength(11);
  });

  it("submits the chosen letter", () => {
    const q = baseQuestion({ type: "summary_completion", optionPool: bank, wordLimit: null });
    expect(clickChoice(q, "word-J")).toBe("J");
  });

  it("REGRESSION: summary_completion WITHOUT a pool is still free text with its word limit", () => {
    const q = baseQuestion({ type: "summary_completion", optionPool: null, wordLimit: { maxWords: 1, allowNumber: false } });
    const flat = render(QuestionRenderer({ question: q, selectedAnswer: null, onSelect: () => {} }));
    expect(flat.some((el) => el.type === "input")).toBe(true);
    expect(flat.filter((el) => el.type === "button")).toHaveLength(0);
    expect(text(QuestionRenderer({ question: q, selectedAnswer: null, onSelect: () => {} }))).toContain("Write NO MORE THAN ONE WORD");
  });

  it("REGRESSION: sentence_completion is unaffected by the word-bank branch", () => {
    const q = baseQuestion({ type: "sentence_completion", optionPool: null, wordLimit: { maxWords: 2, allowNumber: false } });
    const flat = render(QuestionRenderer({ question: q, selectedAnswer: null, onSelect: () => {} }));
    expect(flat.some((el) => el.type === "input")).toBe(true);
  });
});
