import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { buildReadingParts, countAnsweredQuestions, findReadingPartIndex } from "./reading-state";
import type { ClientQuestion } from "./types";

/**
 * READING NAVIGATION + HIGHLIGHTING — source verification.
 *
 * The Part model, answer persistence and highlighting live in React client
 * components whose behaviour depends on real DOM selection APIs. The "node"
 * vitest environment has no DOM and the repo has no jsdom/RTL, so these
 * assert the real source directly -- the same approach
 * src/lib/podcast-pipeline/pipeline.test.ts and reading-only-wiring.test.ts
 * already use. The pure logic these components rely on (validator, renderer,
 * grading) is behaviourally tested elsewhere.
 *
 * Target behaviour is defined by docs/reading-ielts-reference-audit.md §5-§6.
 */
const DIR = __dirname;
const readingClient = readFileSync(path.join(DIR, "MockReadingClient.tsx"), "utf8");
const readingState = readFileSync(path.join(DIR, "reading-state.ts"), "utf8");
const highlighter = readFileSync(path.join(DIR, "PassageHighlighter.tsx"), "utf8");
const globals = readFileSync(path.join(DIR, "..", "..", "app", "globals.css"), "utf8");

describe("reading navigation — Part model", () => {
  it("groups questions into Parts by structural passage", () => {
    expect(readingClient).toContain("buildReadingParts(questions)");
    expect(readingState).toContain("last.passageId === question.passageId");
  });

  it("renders every Part, hiding the inactive ones rather than unmounting them", () => {
    // This is what preserves answers AND highlights across switches.
    expect(readingClient).toContain('i === activePart ? "flex" : "hidden"');
    expect(readingClient).toContain("parts.map((part, i) =>");
  });

  it("shows ALL questions of the active Part, not one at a time", () => {
    expect(readingClient).toContain("part.questions.map((q, qi) =>");
    // The old single-question model must be gone.
    expect(readingClient).not.toContain("questions[currentIndex]");
    expect(readingClient).not.toMatch(/const currentQuestion\s*=/);
  });

  it("has no carousel or swipe behaviour", () => {
    expect(readingClient).not.toMatch(/carousel|swipe|touchstart|touchmove|slider/i);
  });

  it("switches Part automatically when navigating to a question in another Part", () => {
    expect(readingClient).toContain("const partIndex = findReadingPartIndex(parts, questionId);");
    expect(readingClient).toContain("if (partIndex >= 0) setActivePart(partIndex);");
  });

  it("prev/next step across the whole test, crossing Part boundaries", () => {
    expect(readingClient).toContain("const flatIndex = questions.findIndex((q) => q.id === activeQuestionId);");
    expect(readingClient).toContain("goToQuestion(questions[flatIndex - 1].id)");
    expect(readingClient).toContain("goToQuestion(questions[flatIndex + 1].id)");
  });

  it("renders the shared compact navigator with passage grouping", () => {
    expect(readingClient).toContain("<QuestionPalette");
    expect(readingClient).toContain('groupLabelPrefix="P"');
    expect(readingClient).toContain("sectionId: question.passageId");
  });

  it("passes the global current question to the shared navigator", () => {
    expect(readingClient).toContain("currentIndex={Math.max(0, flatIndex)}");
    expect(readingClient).toContain("onNavigate={(index) => goToQuestion(questions[index].id)}");
  });

  it("passes answer and review state to the shared navigator", () => {
    expect(readingClient).toContain("answers={answers}");
    expect(readingClient).toContain("flags={flagged}");
  });
});

function question(id: string, passageId: string, sequenceNumber: number): ClientQuestion {
  return {
    id,
    skill: "reading",
    type: "multiple_choice",
    difficulty: "B2",
    passage: `Text ${passageId}`,
    passageTitle: `Title ${passageId}`,
    audioUrl: null,
    question: `Question ${sequenceNumber}`,
    options: ["A", "B", "C"],
    sequenceNumber,
    passageId,
    sectionId: null,
    optionPool: null,
    wordLimit: null,
    groupId: null,
    groupInstructions: null,
    mockSequence: sequenceNumber,
    sectionInstruction: null,
    questionInstruction: null,
    audioInstruction: null,
  };
}

describe("reading navigation — pure state model", () => {
  const questions = [
    ...Array.from({ length: 13 }, (_, index) => question(`p1-q${index + 1}`, "p1", index + 1)),
    ...Array.from({ length: 13 }, (_, index) => question(`p2-q${index + 14}`, "p2", index + 14)),
    ...Array.from({ length: 14 }, (_, index) => question(`p3-q${index + 27}`, "p3", index + 27)),
  ];
  const parts = buildReadingParts(questions);

  it("preserves the production 3-passage / 40-question structure", () => {
    expect(parts.map((part) => part.questions.length)).toEqual([13, 13, 14]);
    expect(parts.flatMap((part) => part.questions).map((item) => item.id)).toEqual(questions.map((item) => item.id));
  });

  it("locates questions on either side of both passage boundaries", () => {
    expect(findReadingPartIndex(parts, "p1-q13")).toBe(0);
    expect(findReadingPartIndex(parts, "p2-q14")).toBe(1);
    expect(findReadingPartIndex(parts, "p2-q26")).toBe(1);
    expect(findReadingPartIndex(parts, "p3-q27")).toBe(2);
  });

  it("counts empty strings as unanswered and preserves answers keyed by id across parts", () => {
    const answers = { "p1-q1": "A", "p2-q14": "", "p3-q40": "political choice" };
    expect(countAnsweredQuestions(questions, answers)).toBe(2);
    expect(countAnsweredQuestions(parts[0].questions, answers)).toBe(1);
    expect(countAnsweredQuestions(parts[1].questions, answers)).toBe(0);
    expect(countAnsweredQuestions(parts[2].questions, answers)).toBe(1);
  });
});

describe("reading navigation — answer persistence", () => {
  it("answers live in component state keyed by question id, so switching Part cannot clear them", () => {
    expect(readingClient).toContain("const [answers, setAnswers] = useState<Record<string, string | null>>(savedAnswers);");
    expect(readingClient).toContain("setAnswers((prev) => ({ ...prev, [questionId]: answer }));");
  });

  it("every answer is still autosaved to the server on change", () => {
    expect(readingClient).toContain('fetch("/api/mock/answer"');
    expect(readingClient).toContain('method: "PUT"');
    expect(readingClient).toContain('section: "reading"');
  });

  it("waits for in-flight autosaves before finishing or changing sections", () => {
    expect(readingClient).toContain("pendingSavesRef.current.add(request)");
    expect(readingClient).toContain("await Promise.allSettled([...pendingSavesRef.current])");
  });

  it("saved answers from the server seed the initial state", () => {
    expect(readingClient).toContain("savedAnswers");
  });

  it("REGRESSION: reading-only submit behaviour is preserved", () => {
    expect(readingClient).toContain("if (!readingOnly) {");
    expect(readingClient).toContain('await fetch("/api/mock/submit"');
    expect(readingClient).toContain("router.push(`/mock/${attemptId}/listening`)");
  });

  it("REGRESSION: the timer still persists across refresh and still fires once", () => {
    expect(readingClient).toContain("sessionStorage.getItem(key)");
    expect(readingClient).toContain("timedOutRef.current");
    expect(readingClient).toContain("void finishAttempt()");
  });
});

describe("reading — responsive behaviour", () => {
  it("no longer blocks small screens", () => {
    expect(readingClient).not.toContain("Desktop Required");
    expect(readingClient).not.toContain("1024 px wide");
  });

  it("keeps the two-panel split as the desktop target", () => {
    expect(readingClient).toContain("w-1/2");
    expect(readingClient).toContain("border-r");
    expect(readingClient).toContain("max-lg:w-full");
    expect(readingClient).toContain("max-lg:border-r-0");
  });

  it("offers a passage/questions switch below desktop", () => {
    expect(readingClient).toContain('mobilePane === "passage"');
    expect(readingClient).toContain('mobilePane === "questions"');
    expect(readingClient).toContain("max-lg:hidden");
    expect(readingClient).toContain("max-lg:flex");
  });
});

describe("highlighting", () => {
  it("supports two colours", () => {
    expect(highlighter).toContain('export type HighlightColor = "yellow" | "green"');
    expect(globals).toContain(".labc-highlight");
    expect(globals).toContain(".labc-highlight--green");
  });

  it("applies a highlight from the current selection", () => {
    expect(highlighter).toContain("range.extractContents()");
    expect(highlighter).toContain("range.insertNode(span)");
  });

  it("recolours and removes an existing highlight", () => {
    expect(highlighter).toContain("const recolor = useCallback");
    expect(highlighter).toContain("const removeOne = useCallback");
    // Clicking an existing highlight opens the toolbar in edit mode, which is
    // what exposes recolour/remove instead of the apply colours.
    expect(highlighter).toContain('place(event.clientX, event.clientY, "edit")');
    expect(highlighter).toContain('toolbar.mode === "edit"');
  });

  it("clears all highlights", () => {
    expect(highlighter).toContain("const clearAll = useCallback");
    expect(highlighter).toContain("querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(unwrapHighlight)");
  });

  it("does not corrupt passage text -- unwrap restores children and re-merges text nodes", () => {
    expect(highlighter).toContain("while (el.firstChild) parent.insertBefore(el.firstChild, el);");
    expect(highlighter).toContain("normalize?.()");
  });

  it("fails safe when a selection cannot be wrapped cleanly", () => {
    expect(highlighter).toContain("} catch {");
    expect(highlighter).toContain("passage text left as-is");
  });

  it("clamps the toolbar inside the viewport", () => {
    expect(highlighter).toContain("if (x < 8) x = 8;");
    expect(highlighter).toContain("window.innerWidth - width - 8");
    expect(highlighter).toContain("if (y < 72) y = clientY + 16;");
  });

  it("highlights persist across Part switches because panels are hidden, not unmounted", () => {
    expect(readingClient).toContain("passageRefs");
    expect(readingClient).toContain('i === activePart ? "flex" : "hidden"');
  });

  it("is scoped to the active Part's passage container", () => {
    expect(readingClient).toContain("<PassageHighlighter getContainer={getActivePassage} containerKey={activePart} />");
    expect(readingClient).toContain("const getActivePassage = useCallback(() => passageRefs.current[activePart] ?? null, [activePart]);");
  });

  it("resolves the container without reading a ref during render", () => {
    // React forbids reading ref.current in the render body; the highlighter
    // therefore takes a getter it calls from effects and event handlers.
    expect(highlighter).toContain("getContainer: () => HTMLElement | null;");
    expect(highlighter).not.toContain("containerRef");
  });
});

/**
 * GROUP INSTRUCTIONS — server hydration and client rendering hops.
 * Asserted against real source, matching this file's existing approach.
 * The contract/validator/rehydration hops are behaviourally tested in
 * src/lib/mock/content/validator.test.ts.
 */
describe("group instructions — persistence path", () => {
  const readingPage = readFileSync(
    path.join(DIR, "..", "..", "app", "(app)", "mock", "[attemptId]", "reading", "page.tsx"), "utf8");
  const clientTypes = readFileSync(path.join(DIR, "types.ts"), "utf8");

  it("HOP: hydration selects the column", () => {
    expect(readingPage).toContain("mock_group_instructions");
    expect(readingPage).toContain("`${BASE_QUESTION_COLUMNS}, mock_group_instructions`");
  });

  it("HOP: hydration degrades gracefully if the migration is not yet applied", () => {
    // Selecting a non-existent column fails the WHOLE PostgREST query with
    // 42703 -- the documented breakage behind the hardcoded instruction nulls
    // in src/lib/assessment/engine.ts. The fallback keeps the exam loadable.
    expect(readingPage).toContain('["42703", "PGRST204"].includes(withInstructions.error.code)');
    expect(readingPage).toContain(".select(BASE_QUESTION_COLUMNS)");
  });

  it("HOP: hydration maps the column onto the client payload", () => {
    expect(readingPage).toContain("groupInstructions: q.mock_group_instructions ?? null,");
  });

  it("HOP: the client payload type carries it", () => {
    expect(clientTypes).toContain("groupInstructions: string | null;");
  });

  it("HOP: the runtime renders it once per group, not per question", () => {
    expect(readingClient).toContain("{startsGroup && q.groupInstructions && (");
    expect(readingClient).toContain("splitGroupInstructions(q.groupInstructions)");
    expect(readingClient).toContain("{instruction.detail}");
    // Guarded by startsGroup, which is only true at a group's first question.
    expect(readingClient).toContain("const startsGroup = q.groupId != null && q.groupId !== prevGroup;");
  });

  it("renders multi-line instructions (the 'NB ...' rider on its own line)", () => {
    expect(readingClient).toContain("whitespace-pre-line");
  });

});
