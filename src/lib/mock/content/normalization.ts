/**
 * Deterministic answer normalization/comparison for Mock content.
 *
 * Deliberately conservative: normalizes case, surrounding whitespace, and
 * OUTER punctuation only. It never touches internal punctuation (hyphens,
 * apostrophes, colons, slashes) or digits, because those can carry real
 * meaning in a correct answer ("well-known", "don't", "9:30", "1990") --
 * stripping them would risk two DIFFERENT answers silently comparing equal,
 * which is a worse failure than an learner's genuinely-correct answer with
 * trailing punctuation failing to match.
 */
import type { WordLimit } from "./types";

/** Case + whitespace + outer-punctuation normalization only -- see this
 * module's own doc comment for why internal punctuation is left alone. */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/^["'`.,;:!?()]+|["'`.,;:!?()]+$/g, "");
}

/** True if `userAnswer` matches `correctAnswer` or any of `acceptedAnswers`,
 * after normalization. */
export function answersMatch(userAnswer: string, correctAnswer: string, acceptedAnswers: string[] = []): boolean {
  const normalizedUser = normalizeAnswer(userAnswer);
  return [correctAnswer, ...acceptedAnswers].some((candidate) => normalizeAnswer(candidate) === normalizedUser);
}

/** Whitespace-delimited token count. A standalone numeral (e.g. "1990")
 * counts as exactly one token/word here, matching the real IELTS "a number
 * counts as one word" marking convention -- this needs no special-casing
 * beyond plain whitespace splitting, which is why WordLimit.allowNumber
 * doesn't change this function's behavior (see types.ts's own doc comment
 * on that field). */
export function countWords(answer: string): number {
  return answer.trim().split(/\s+/).filter(Boolean).length;
}

/** True if `answer` exceeds `limit.maxWords` tokens. */
export function violatesWordLimit(answer: string, limit: WordLimit): boolean {
  return countWords(answer) > limit.maxWords;
}
