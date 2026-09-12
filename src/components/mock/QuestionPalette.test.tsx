import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionPalette } from "./QuestionPalette";

describe("QuestionPalette", () => {
  it("keeps the section-agnostic palette behavior used by Reading", () => {
    const html = renderToStaticMarkup(
      <QuestionPalette
        questions={[{ id: "r1", sequenceNumber: 1 }, { id: "r2", sequenceNumber: 2 }]}
        currentIndex={1}
        answers={{ r1: "A" }}
        flags={{ r2: true }}
        onNavigate={() => undefined}
        onPrev={() => undefined}
        onNext={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Question 1 (answered)"');
    expect(html).toContain('aria-label="Question 2 (flagged)"');
    expect(html).toContain('aria-current="true"');
    expect(html).not.toContain(">S1<");
  });

  it("marks Listening section boundaries while keeping all 40 questions navigable", () => {
    const questions = Array.from({ length: 40 }, (_, index) => ({
      id: `q${index + 1}`,
      sequenceNumber: index + 1,
      sectionId: `s${Math.floor(index / 10) + 1}`,
    }));
    const html = renderToStaticMarkup(
      <QuestionPalette
        questions={questions}
        currentIndex={0}
        answers={{}}
        onNavigate={() => undefined}
        onPrev={() => undefined}
        onNext={() => undefined}
      />,
    );

    for (let number = 1; number <= 40; number += 1) {
      expect(html).toContain(`aria-label="Question ${number}"`);
    }
    expect(countOccurrences(html, ">S1<")).toBe(1);
    expect(countOccurrences(html, ">S2<")).toBe(1);
    expect(countOccurrences(html, ">S3<")).toBe(1);
    expect(countOccurrences(html, ">S4<")).toBe(1);
  });
});

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}
