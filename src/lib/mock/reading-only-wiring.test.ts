import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * READING-ONLY WIRING — source verification.
 *
 * The navigation and route-guard changes live in React Server Components, a
 * client component and a Next route handler. A behavioural test would need to
 * mock Supabase auth, the router and fetch across four files -- disproportionate
 * for changes that are each a single conditional. This file verifies the real
 * source directly, the same approach src/lib/podcast-pipeline/pipeline.test.ts
 * already uses, while the logic those conditionals depend on
 * (isReadingOnlyAttempt, submitMock, assembleMock) is behaviourally tested in
 * engine.test.ts and assembler.test.ts.
 */
const SRC = path.join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(path.join(SRC, ...p), "utf8");

const readingClient = read("components", "mock", "MockReadingClient.tsx");
const readingPage = read("app", "(app)", "mock", "[attemptId]", "reading", "page.tsx");
const listeningPage = read("app", "(app)", "mock", "[attemptId]", "listening", "page.tsx");
const resultPage = read("app", "(app)", "mock", "[attemptId]", "result", "page.tsx");
const submitRoute = read("app", "api", "mock", "submit", "route.ts");
const startRoute = read("app", "api", "mock", "start", "route.ts");
const startButton = read("components", "mock", "MockStartButton.tsx");

describe("reading-only — finishing Reading", () => {
  it("submits the mock instead of routing to /listening when reading-only", () => {
    expect(readingClient).toContain('await fetch("/api/mock/submit"');
    expect(readingClient).toContain("if (!readingOnly) {");
    expect(readingClient).toContain("router.push(`/mock/${attemptId}/result`)");
  });

  it("a FULL mock still hands over to /listening -- unchanged", () => {
    expect(readingClient).toContain("router.push(`/mock/${attemptId}/listening`)");
  });

  it("both the finish button and the timer expiry go through the same path", () => {
    // One shared finishAttempt(), called from both, so the two can never diverge.
    expect(readingClient).toContain("const finishAttempt = useCallback");
    expect(readingClient.match(/void finishAttempt\(\)/g)).toHaveLength(2);
  });

  it("the reading page derives readingOnly from the attempt's own recorded structure", () => {
    expect(readingPage).toContain("listening_question_ids");
    expect(readingPage).toContain("readingOnly={isReadingOnlyAttempt(attempt.listening_question_ids as string[] | null)}");
  });
});

describe("reading-only — direct navigation safety", () => {
  it("/listening redirects to the result instead of rendering an empty listening test", () => {
    expect(listeningPage).toContain("if (isReadingOnlyAttempt(attempt.listening_question_ids as string[] | null)) {");
    expect(listeningPage).toContain("redirect(`/mock/${attemptId}/result`)");
  });

  it("/result sends an unfinished reading-only attempt back to /reading, not /listening", () => {
    expect(resultPage).toContain('isReadingOnlyAttempt(attempt.listening_question_ids as string[] | null) ? "reading" : "listening"');
    expect(resultPage).toContain("redirect(`/mock/${attemptId}/${unfinishedSection}`)");
  });

  it("/result no longer redirects unconditionally to /listening", () => {
    expect(resultPage).not.toContain("redirect(`/mock/${attemptId}/listening`)");
  });
});

describe("reading-only — API surface", () => {
  it("the start route accepts an optional sections flag that defaults to full", () => {
    expect(startRoute).toContain('sections: z.enum(["full", "reading_only"]).optional()');
  });

  it("the start button opts into reading-only", () => {
    expect(startButton).toContain('sections: "reading_only"');
  });

  it("the Reading-only start surface states the 60-minute duration", () => {
    expect(startButton).toContain("60 minutes · answers auto-saved");
    expect(startButton).not.toContain("~55 minutes");
  });
});

describe("submit route — listening weak-area regression", () => {
  it("does not flag listening as weak when no listening section was sat", () => {
    expect(submitRoute).toContain("result.listeningTotal > 0 && result.listeningCorrect / result.listeningTotal < 0.5");
  });

  it("no longer uses the `|| 1` fallback that made 0/0 evaluate as weak", () => {
    expect(submitRoute).not.toContain("(result.listeningTotal || 1)");
    expect(submitRoute).not.toContain("(result.readingTotal || 1)");
  });

  it("reading weak-area detection is guarded the same way and otherwise unchanged", () => {
    expect(submitRoute).toContain("result.readingTotal > 0 && result.readingCorrect / result.readingTotal < 0.5");
    expect(submitRoute).toContain('weakAreas.push("reading_comprehension")');
    expect(submitRoute).toContain('weakAreas.push("listening_comprehension")');
  });
});

describe("Initial Assessment is untouched by this change", () => {
  it("no Mock file IMPORTS the Initial Assessment engine", () => {
    // Matches import statements only -- a doc comment referencing
    // src/lib/assessment/engine.ts (the reading page has one, pre-existing and
    // untouched) is a cross-reference, not a coupling.
    for (const source of [readingClient, readingPage, listeningPage, resultPage, submitRoute, startRoute, startButton]) {
      expect(source).not.toMatch(/^\s*import[^;]*from\s*"@?\/?(src\/)?lib\/assessment\//m);
    }
  });

  it("the assessment engine and its scoring are not imported by the Mock engine", () => {
    const mockEngine = read("lib", "mock", "engine.ts");
    expect(mockEngine).not.toMatch(/from "@\/lib\/assessment\/(engine|scoring)"/);
  });
});

describe("scoring.ts is untouched", () => {
  it("mock scoring still computes overall from both sections, with the existing zero guards", () => {
    const scoring = read("lib", "mock", "scoring.ts");
    expect(scoring).toContain("const readingPct = readingTotal > 0 ? (readingCorrect / readingTotal) * 100 : 0;");
    expect(scoring).toContain("const listeningPct = listeningTotal > 0 ? (listeningCorrect / listeningTotal) * 100 : 0;");
    expect(scoring).toContain("const overallPct = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;");
  });
});
