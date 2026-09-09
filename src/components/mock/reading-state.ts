import type { ClientQuestion } from "./types";

export interface ReadingPart {
  index: number;
  passageId: string | null;
  title: string;
  passage: string | null;
  questions: ClientQuestion[];
}

/** Groups a persisted, ordered Reading question list into contiguous passage
 * parts without copying answer/flag state into the structure. */
export function buildReadingParts(questions: ClientQuestion[]): ReadingPart[] {
  const parts: ReadingPart[] = [];
  for (const question of questions) {
    const last = parts.at(-1);
    if (last && last.passageId === question.passageId) {
      last.questions.push(question);
      continue;
    }
    parts.push({
      index: parts.length,
      passageId: question.passageId,
      title: question.passageTitle ?? `Reading Passage ${parts.length + 1}`,
      passage: question.passage ?? null,
      questions: [question],
    });
  }
  return parts;
}

export function findReadingPartIndex(parts: ReadingPart[], questionId: string): number {
  return parts.findIndex((part) => part.questions.some((question) => question.id === questionId));
}

export function countAnsweredQuestions(
  questions: Pick<ClientQuestion, "id">[],
  answers: Record<string, string | null>,
): number {
  return questions.filter((question) => answers[question.id] != null && answers[question.id] !== "").length;
}
