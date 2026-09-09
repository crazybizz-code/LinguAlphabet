/**
 * IELTS Mock content contract — the strongly-typed, in-memory representation
 * of generated Mock content, used BOTH before it is inserted into
 * assessment_questions/mock_passages/mock_listening_sections, and when
 * re-hydrated from those tables for an assembly-time safety check (see
 * ./validator.ts's two entry points, buildContractFromGeneratedContent
 * usage vs. fromAssembledRows).
 *
 * This module deliberately does NOT talk to Supabase, the AI provider, or
 * anything else with a side effect — it is pure data shape plus (in
 * validator.ts) pure functions over that shape.
 */

import type { CefrLevel } from "@/types/content";

/** Reading-specific IELTS question types this project's validator supports. */
export type ReadingQuestionType =
  | "multiple_choice"
  | "true_false_not_given"
  | "yes_no_not_given"
  | "matching_headings"
  | "matching_information"
  | "matching_features"
  | "matching_sentence_endings"
  | "sentence_completion"
  | "summary_completion"
  | "note_completion";

/** Listening-specific IELTS question types this project's validator supports. */
export type ListeningQuestionType =
  | "multiple_choice"
  | "matching"
  | "plan_map_diagram_labeling"
  | "form_note_table_flowchart_summary_completion"
  | "sentence_completion";

export type MockQuestionType = ReadingQuestionType | ListeningQuestionType;

/** The three "family" buckets validation rules branch on -- most rules
 * don't care about the exact type name, only which family it belongs to. */
export type QuestionTypeFamily = "multiple_choice" | "true_false_style" | "matching_style" | "completion";

const READING_TYPES: ReadingQuestionType[] = [
  "multiple_choice", "true_false_not_given", "yes_no_not_given",
  "matching_headings", "matching_information", "matching_features", "matching_sentence_endings",
  "sentence_completion", "summary_completion", "note_completion",
];
const LISTENING_TYPES: ListeningQuestionType[] = [
  "multiple_choice", "matching", "plan_map_diagram_labeling",
  "form_note_table_flowchart_summary_completion", "sentence_completion",
];

/** The authoritative skill -> allowed-type-set map. A type not listed for a
 * skill is rejected by validateQuestion() with SKILL_TYPE_MISMATCH, even if
 * it's a valid type for the OTHER skill (e.g. matching_headings is
 * reading-only; plan_map_diagram_labeling is listening-only). */
export const ALLOWED_TYPES_BY_SKILL: Record<"reading" | "listening", MockQuestionType[]> = {
  reading: READING_TYPES,
  listening: LISTENING_TYPES,
};

const FAMILY_BY_TYPE: Record<MockQuestionType, QuestionTypeFamily> = {
  multiple_choice: "multiple_choice",
  true_false_not_given: "true_false_style",
  yes_no_not_given: "true_false_style",
  matching_headings: "matching_style",
  matching_information: "matching_style",
  matching_features: "matching_style",
  matching_sentence_endings: "matching_style",
  matching: "matching_style",
  plan_map_diagram_labeling: "matching_style",
  sentence_completion: "completion",
  summary_completion: "completion",
  note_completion: "completion",
  form_note_table_flowchart_summary_completion: "completion",
};

export function familyOf(type: MockQuestionType): QuestionTypeFamily {
  return FAMILY_BY_TYPE[type];
}

export function isKnownMockQuestionType(type: string): type is MockQuestionType {
  return type in FAMILY_BY_TYPE;
}

/** A completion-type answer's declared word limit, e.g. "NO MORE THAN TWO
 * WORDS" or "NO MORE THAN THREE WORDS AND/OR A NUMBER". Represented
 * numerically (not as a free-text string) so the validator's word-count
 * check has an exact, unambiguous contract -- see
 * supabase/mock-question-content-schema.sql's answer_word_limit column for
 * the fixed set of DB string labels this maps to/from. */
export interface WordLimit {
  maxWords: 1 | 2 | 3;
  /** "...AND/OR A NUMBER" -- a standalone numeral is permitted and counts as
   * one word, exactly like any other token (see normalization.ts's
   * countWords doc comment for why this needs no special-case logic). Kept
   * as an explicit, separate flag purely for authoring/documentation
   * fidelity to the real IELTS instruction wording, not because it changes
   * the counting algorithm. */
  allowNumber: boolean;
}

export const WORD_LIMIT_DB_LABELS = [
  "ONE_WORD", "TWO_WORDS", "THREE_WORDS",
  "ONE_WORD_AND_OR_A_NUMBER", "TWO_WORDS_AND_OR_A_NUMBER", "THREE_WORDS_AND_OR_A_NUMBER",
] as const;
export type WordLimitDbLabel = (typeof WORD_LIMIT_DB_LABELS)[number];

export function wordLimitFromDbLabel(label: WordLimitDbLabel): WordLimit {
  const allowNumber = label.endsWith("_AND_OR_A_NUMBER");
  const maxWords = label.startsWith("ONE") ? 1 : label.startsWith("TWO") ? 2 : 3;
  return { maxWords, allowNumber };
}

export function wordLimitToDbLabel(limit: WordLimit): WordLimitDbLabel {
  const base = limit.maxWords === 1 ? "ONE_WORD" : limit.maxWords === 2 ? "TWO_WORDS" : "THREE_WORDS";
  return (limit.allowNumber ? `${base}_AND_OR_A_NUMBER` : base) as WordLimitDbLabel;
}

/** One item in a matching/labelling-family question group's shared option
 * pool (e.g. a heading, a diagram label, a list of features). */
export interface MockOptionPoolItem {
  /** The identifier a correct answer references (e.g. "A", "vii"), never the display text itself. */
  id: string;
  text: string;
}

/** Runtime guard for jsonb option pools read from Supabase. */
export function isMockOptionPool(value: unknown): value is MockOptionPoolItem[] {
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const candidate = item as Record<string, unknown>;
    return typeof candidate.id === "string"
      && candidate.id.trim().length > 0
      && typeof candidate.text === "string"
      && candidate.text.trim().length > 0;
  });
}

/** Runtime guard for jsonb arrays that are contractually strings. */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Every question, regardless of type, carries this shape. Type-specific
 * fields (options, wordLimit, ...) are optional and validated for
 * presence/shape by the type-specific rules in validator.ts, not by this
 * interface alone -- TypeScript's structural typing can't express "required
 * only for MCQ", so validator.ts is where that's actually enforced. */
export interface MockQuestionContract {
  /** Stable, generator-assigned id. A real uuid once persisted, but the
   * validator only requires it to be a non-empty, unique-within-scope
   * string -- it doesn't assume a uuid shape, since pre-persistence content
   * may use a temporary human-readable id. */
  id: string;
  skill: "reading" | "listening";
  type: MockQuestionType;
  /** 1-based position within this question's structural parent (passage or section). */
  order: number;
  questionText: string;
  /** Required for multiple_choice only. */
  options?: string[];
  /** For multiple_choice: one of `options`. For true_false_not_given /
   * yes_no_not_given: one of the fixed allowed literals. For matching-style:
   * the `id` of one item in the group's optionPool. For completion: the
   * primary correct answer string. */
  correctAnswer: string;
  /** Completion-type only: alternate correct spellings/forms. */
  acceptedAnswers?: string[];
  /** Completion-type only. */
  wordLimit?: WordLimit;
  explanation?: string | null;
  difficulty: CefrLevel;
  /** The id of the mock_passages/mock_listening_sections row this question
   * belongs to. Required for every Mock question -- see MISSING_STRUCTURAL_PARENT. */
  structuralParentId: string;
  /** Which QuestionGroup within the parent this belongs to, matching
   * MockQuestionGroupContract.groupId. Required whenever this question is
   * part of a matching/labelling-family group (so the shared pool can be
   * cross-checked); optional for a standalone question. */
  groupId?: string;
}

/** A set of questions sharing one task/instruction and (for matching-style
 * types) one option pool, e.g. "Questions 14-19: Matching Headings". Every
 * question in `questions` is expected to declare the SAME `type` and (for
 * matching-style types) an IDENTICAL `optionPool` -- validated, not assumed. */
export interface MockQuestionGroupContract {
  groupId: string;
  taskType: MockQuestionType;
  instructions: string;
  /** Required for matching-style types, absent otherwise. */
  optionPool?: MockOptionPoolItem[];
  questions: MockQuestionContract[];
}

export interface MockPassageContract {
  /** Exactly one structural id once persisted -- the same value every
   * question in this passage's groups must use as its structuralParentId. */
  id: string;
  title: string | null;
  difficulty: CefrLevel | null;
  bodyText: string;
  questionGroups: MockQuestionGroupContract[];
}

export interface MockListeningSectionContract {
  id: string;
  title: string | null;
  difficulty: CefrLevel | null;
  transcript: string | null;
  /** Real audio is generated later (see this project's explicit "no Fish
   * Audio calls yet" scope for this task) -- null is the normal, expected
   * state for content that has been authored/validated but not yet
   * synthesized. */
  audioUrl: string | null;
  questionGroups: MockQuestionGroupContract[];
}

export interface MockReadingContentContract {
  passages: MockPassageContract[];
}

export interface MockListeningContentContract {
  sections: MockListeningSectionContract[];
}

export interface MockFullContentContract {
  reading: MockReadingContentContract;
  listening: MockListeningContentContract;
}

// ── Validation result shape ──────────────────────────────────────────────

export interface ValidationError {
  /** Stable, machine-readable code -- see validator.ts's own doc comment for
   * the full list. Kept stable deliberately so a future generator/repair
   * step can branch on it. */
  code: string;
  /** e.g. "reading.passages[1].questionGroups[0].questions[4]" */
  path: string;
  message: string;
  passageId?: string;
  sectionId?: string;
  groupId?: string;
  questionId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
