export type IeltsQuestionType =
  | "multiple_choice"
  | "true_false_not_given"
  | "yes_no_not_given"
  | "matching"
  | "matching_headings"
  | "matching_information"
  | "matching_features"
  | "matching_sentence_endings"
  | "map_labelling"
  | "diagram_labelling"
  | "form_completion"
  | "note_completion"
  | "table_completion"
  | "flow_chart_completion"
  | "summary_completion"
  | "sentence_completion";

export interface AnswerValidationInput {
  questionType: IeltsQuestionType;
  userAnswer: unknown;
  correctAnswer: unknown;
  acceptedAnswers?: unknown;
  wordLimit?: number | null;
}

export interface AnswerValidationResult {
  isCorrect: boolean;
  normalizedAnswer: unknown;
  reason: "correct" | "incorrect" | "empty" | "word_limit_exceeded" | "invalid_shape";
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function wordCount(value: string): number {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function answerList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function matchesText(userAnswer: unknown, candidates: unknown[]): boolean {
  const user = normalizeText(userAnswer);
  return user.length > 0 && candidates.some((candidate) => normalizeText(candidate) === user);
}

function matchesMapping(userAnswer: unknown, correctAnswer: unknown): boolean {
  if (!userAnswer || typeof userAnswer !== "object" || Array.isArray(userAnswer)) return false;
  if (!correctAnswer || typeof correctAnswer !== "object" || Array.isArray(correctAnswer)) return false;

  const user = userAnswer as Record<string, unknown>;
  const correct = correctAnswer as Record<string, unknown>;
  const userKeys = Object.keys(user).sort();
  const correctKeys = Object.keys(correct).sort();
  if (userKeys.length !== correctKeys.length || userKeys.some((key, i) => key !== correctKeys[i])) return false;

  return correctKeys.every((key) => normalizeText(user[key]) === normalizeText(correct[key]));
}

/**
 * Pure server-side validator. It deliberately does not infer correctness from
 * UI state and never trusts a client-supplied isCorrect flag.
 */
export function validateIeltsAnswer(input: AnswerValidationInput): AnswerValidationResult {
  const { questionType, userAnswer, correctAnswer, acceptedAnswers = [], wordLimit = null } = input;

  if (userAnswer === null || userAnswer === undefined || normalizeText(userAnswer) === "") {
    return { isCorrect: false, normalizedAnswer: userAnswer, reason: "empty" };
  }

  if (wordLimit !== null && wordLimit !== undefined) {
    const values = answerList(userAnswer).filter((value) => typeof value === "string") as string[];
    if (values.some((value) => wordCount(value) > wordLimit)) {
      return { isCorrect: false, normalizedAnswer: userAnswer, reason: "word_limit_exceeded" };
    }
  }

  if (
    questionType === "matching" ||
    questionType === "matching_headings" ||
    questionType === "matching_information" ||
    questionType === "matching_features" ||
    questionType === "matching_sentence_endings"
  ) {
    const isCorrect = matchesMapping(userAnswer, correctAnswer);
    return { isCorrect, normalizedAnswer: userAnswer, reason: isCorrect ? "correct" : "incorrect" };
  }

  const candidates = [correctAnswer, ...answerList(acceptedAnswers)];
  const isCorrect = matchesText(userAnswer, candidates);
  return { isCorrect, normalizedAnswer: normalizeText(userAnswer), reason: isCorrect ? "correct" : "incorrect" };
}
