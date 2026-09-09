/**
 * Deterministic IELTS Mock content validator.
 *
 * Pure functions only — no Supabase, no AI provider, no side effects. This
 * is the SINGLE place validation logic lives; both real call sites reuse it
 * rather than re-implementing checks:
 *   1. Before inserting generated content — call validateFullMockContent()
 *      (or validateReadingMock()/validateListeningMock() individually)
 *      directly on the content contract a generator produced.
 *   2. As a Mock-assembly-time safety check — call validateAssembledMock(),
 *      which re-hydrates the SAME contract shape from flat, already-
 *      persisted assessment_questions/mock_passages/mock_listening_sections
 *      rows and then calls the exact same validateReadingMock()/
 *      validateListeningMock() functions. Nothing about the actual rules is
 *      duplicated between the two paths.
 *
 * ERROR CODES are deliberately stable strings (never renumbered/renamed) so
 * a future generator/auto-repair step can branch on `error.code` directly.
 */

import type {
  MockQuestionContract,
  MockQuestionGroupContract,
  MockPassageContract,
  MockListeningSectionContract,
  MockReadingContentContract,
  MockListeningContentContract,
  MockFullContentContract,
  MockOptionPoolItem,
  MockQuestionType,
  ValidationError,
  ValidationResult,
  WordLimit,
} from "./types";
import {
  ALLOWED_TYPES_BY_SKILL,
  WORD_LIMIT_DB_LABELS,
  familyOf,
  isKnownMockQuestionType,
  isMockOptionPool,
  isStringArray,
  wordLimitFromDbLabel,
  type WordLimitDbLabel,
} from "./types";
import { violatesWordLimit } from "./normalization";

const READING_PASSAGE_COUNT = 3;
const READING_QUESTION_COUNT = 40;
const LISTENING_SECTION_COUNT = 4;
const LISTENING_QUESTION_COUNT = 40;

const TFNG_ANSWERS = ["true", "false", "not given"];
const YNNG_ANSWERS = ["yes", "no", "not given"];

function err(code: string, path: string, message: string, extra: Partial<ValidationError> = {}): ValidationError {
  return { code, path, message, ...extra };
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── Question-level validation ─────────────────────────────────────────────

/**
 * Validates one question in isolation, given the structural context it's
 * expected to belong to (its parent's id, the skill that parent implies,
 * and — for matching-style types — the group's shared option pool).
 */
export function validateQuestion(
  question: MockQuestionContract,
  context: { expectedParentId: string; expectedSkill: "reading" | "listening"; optionPool?: MockOptionPoolItem[] },
  path: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const loc = { questionId: question.id };

  // 13: missing structural parent.
  if (!question.structuralParentId) {
    errors.push(err("MISSING_STRUCTURAL_PARENT", path, "Question has no structural parent (passage/section) id.", loc));
  } else if (question.structuralParentId !== context.expectedParentId) {
    // 12: pointing to the wrong passage/section.
    errors.push(err("WRONG_STRUCTURAL_PARENT", path, `Question's structural parent "${question.structuralParentId}" does not match the expected parent "${context.expectedParentId}".`, loc));
  }

  // 14/15: cross-skill content.
  if (question.skill !== context.expectedSkill) {
    const code = context.expectedSkill === "reading" ? "READING_CONTAINS_LISTENING" : "LISTENING_CONTAINS_READING";
    errors.push(err(code, path, `Expected a ${context.expectedSkill} question but found skill="${question.skill}".`, loc));
  }

  // 3: invalid question type.
  if (!isKnownMockQuestionType(question.type)) {
    errors.push(err("INVALID_QUESTION_TYPE", path, `"${question.type}" is not a recognised Mock question type.`, loc));
    return errors; // nothing type-specific to check against an unknown type
  }

  // 4: wrong skill/type combination (e.g. matching_headings for listening).
  if (!ALLOWED_TYPES_BY_SKILL[context.expectedSkill].includes(question.type)) {
    errors.push(err("SKILL_TYPE_MISMATCH", path, `"${question.type}" is not a valid question type for skill="${context.expectedSkill}".`, loc));
  }

  // 1: missing question text.
  if (!question.questionText || question.questionText.trim().length === 0) {
    errors.push(err("MISSING_QUESTION_TEXT", path, "Question text is missing or empty.", loc));
  }

  // 2: missing correct answer.
  if (!question.correctAnswer || question.correctAnswer.trim().length === 0) {
    errors.push(err("MISSING_CORRECT_ANSWER", path, "Question has no correct answer.", loc));
    return errors; // every type-specific answer check below needs a real answer to inspect
  }

  const family = familyOf(question.type);

  if (family !== "completion" && (question.acceptedAnswers?.length ?? 0) > 0) {
    errors.push(err("UNEXPECTED_ACCEPTED_ANSWERS", path, `"${question.type}" cannot declare completion answer variants.`, loc));
  }
  if (family !== "completion" && question.wordLimit) {
    errors.push(err("UNEXPECTED_WORD_LIMIT", path, `"${question.type}" cannot declare a completion word limit.`, loc));
  }

  if (family === "multiple_choice") {
    errors.push(...validateMultipleChoice(question, path, loc));
  } else if (family === "true_false_style") {
    errors.push(...validateTrueFalseStyle(question, path, loc));
  } else if (family === "matching_style") {
    errors.push(...validateMatchingStyle(question, context.optionPool, path, loc));
  } else if (family === "completion") {
    // Word-bank variant: the answer is a pool letter, so it is validated
    // exactly like a matching answer and carries no word limit. The
    // free-text variant keeps its original word-limit rules untouched.
    if (context.optionPool && context.optionPool.length > 0) {
      errors.push(...validateMatchingStyle(question, context.optionPool, path, loc));
    } else {
      errors.push(...validateCompletion(question, path, loc));
    }
  }

  return errors;
}

function validateMultipleChoice(question: MockQuestionContract, path: string, loc: Partial<ValidationError>): ValidationError[] {
  const errors: ValidationError[] = [];
  const options = question.options ?? [];

  // 7: MCQ without valid options (3-4 required).
  if (options.length < 3 || options.length > 4) {
    errors.push(err("INVALID_MCQ_OPTIONS", path, `Multiple-choice question must contain exactly 3-4 options (found ${options.length}).`, loc));
    return errors;
  }

  const matches = options.filter((o) => o === question.correctAnswer).length;
  if (matches === 0) {
    // 8: no correct option.
    errors.push(err("MCQ_NO_CORRECT_OPTION", path, "Correct answer does not match any of the provided options.", loc));
  } else if (matches > 1) {
    // 9: multiple correct options (not explicitly supported by this schema's singular correct_answer column).
    errors.push(err("MCQ_MULTIPLE_CORRECT_OPTIONS", path, "Correct answer matches more than one option — multiple-correct MCQ is not supported.", loc));
  }

  return errors;
}

function validateTrueFalseStyle(question: MockQuestionContract, path: string, loc: Partial<ValidationError>): ValidationError[] {
  const normalized = normalizeText(question.correctAnswer);
  if (question.type === "true_false_not_given") {
    if (!TFNG_ANSWERS.includes(normalized)) {
      return [err("INVALID_TFNG_ANSWER", path, `True/False/Not Given answer must be exactly one of TRUE, FALSE, or NOT GIVEN (found "${question.correctAnswer}").`, loc)];
    }
  } else if (question.type === "yes_no_not_given") {
    if (!YNNG_ANSWERS.includes(normalized)) {
      return [err("INVALID_YNNG_ANSWER", path, `Yes/No/Not Given answer must be exactly one of YES, NO, or NOT GIVEN (found "${question.correctAnswer}").`, loc)];
    }
  }
  return [];
}

function validateMatchingStyle(question: MockQuestionContract, optionPool: MockOptionPoolItem[] | undefined, path: string, loc: Partial<ValidationError>): ValidationError[] {
  if (!optionPool || optionPool.length === 0) {
    return [err("MISSING_OPTION_POOL", path, `"${question.type}" requires a shared option pool, but its group has none.`, loc)];
  }
  const validIds = new Set(optionPool.map((o) => o.id));
  if (!validIds.has(question.correctAnswer)) {
    return [err("INVALID_POOL_REFERENCE", path, `Correct answer "${question.correctAnswer}" is not one of the option pool's ids.`, loc)];
  }
  return [];
}

function validateCompletion(question: MockQuestionContract, path: string, loc: Partial<ValidationError>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!question.wordLimit) {
    errors.push(err("INVALID_COMPLETION_ANSWER", path, "Completion question has no declared word limit.", loc));
    return errors;
  }
  const limit: WordLimit = question.wordLimit;
  if (![1, 2, 3].includes(limit.maxWords)) {
    errors.push(err("INVALID_COMPLETION_ANSWER", path, `Word limit's maxWords must be 1, 2, or 3 (found ${limit.maxWords}).`, loc));
    return errors;
  }
  if ((question.acceptedAnswers ?? []).some((a) => !a || a.trim().length === 0)) {
    errors.push(err("INVALID_COMPLETION_ANSWER", path, "One or more accepted-answer variants is empty.", loc));
  }

  const answersToCheck = [question.correctAnswer, ...(question.acceptedAnswers ?? [])];
  for (const answer of answersToCheck) {
    if (violatesWordLimit(answer, limit)) {
      errors.push(err("WORD_LIMIT_EXCEEDED", path, `Answer "${answer}" exceeds the declared word limit of ${limit.maxWords} word(s).`, loc));
    }
  }

  return errors;
}

// ── Group-level validation ────────────────────────────────────────────────

/**
 * WORD-BANK COMPLETION. Real IELTS Summary Completion comes in two
 * mechanically different variants (both present in the audited reference):
 *
 *   - "from the passage"  -> free text, obeys a word limit, graded by
 *                            answersMatch() against the passage wording.
 *   - "from a word list"  -> the learner picks a LETTER from a supplied pool
 *                            (A-K in the reference), and the stored answer is
 *                            that letter.
 *
 * They share one `type`, so the pool itself is the discriminator: a
 * completion-family group carrying an optionPool is the word-bank variant.
 * This needs no new question type and no schema column -- option_pool already
 * exists on assessment_questions and already round-trips.
 */
/** Generous ceiling for group instruction text. Real IELTS task instructions
 * run well under this even with an "NB You may use any letter more than once."
 * rider appended; the limit exists to catch passage text pasted into the wrong
 * field, not to police wording. */
export const MAX_GROUP_INSTRUCTIONS_LENGTH = 600;

export function isWordBankGroup(group: { taskType: MockQuestionType; optionPool?: MockOptionPoolItem[] }): boolean {
  return familyOf(group.taskType) === "completion" && !!group.optionPool && group.optionPool.length > 0;
}

export function validateQuestionGroup(
  group: MockQuestionGroupContract,
  context: { expectedParentId: string; expectedSkill: "reading" | "listening" },
  path: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const family = familyOf(group.taskType);
  const groupLoc = { groupId: group.groupId };

  for (const question of group.questions) {
    if (question.type !== group.taskType) {
      errors.push(err(
        "GROUP_TASK_TYPE_MISMATCH",
        path,
        `Group "${group.groupId}" declares task type "${group.taskType}" but question "${question.id}" has type "${question.type}".`,
        { ...groupLoc, questionId: question.id },
      ));
    }
    if (question.groupId && question.groupId !== group.groupId) {
      errors.push(err("WRONG_QUESTION_GROUP", path, `Question "${question.id}" points to group "${question.groupId}" instead of "${group.groupId}".`, { ...groupLoc, questionId: question.id }));
    }
  }

  // GROUP INSTRUCTIONS.
  //
  // An empty string stays legal: a standalone question rehydrated from the DB
  // has no shared task, and pre-existing content predates the column. What is
  // rejected is a non-string, or prose long enough to indicate that passage
  // body text has been pasted into the instruction slot by mistake -- that
  // would render as a task heading above the questions.
  if (typeof group.instructions !== "string") {
    errors.push(err("INVALID_GROUP_INSTRUCTIONS", path, `Group "${group.groupId}" has non-string instructions.`, groupLoc));
  } else if (group.instructions.length > MAX_GROUP_INSTRUCTIONS_LENGTH) {
    errors.push(err("INVALID_GROUP_INSTRUCTIONS", path, `Group "${group.groupId}" has instructions of ${group.instructions.length} characters, over the ${MAX_GROUP_INSTRUCTIONS_LENGTH}-character limit.`, groupLoc));
  }

  if (group.optionPool) {
    const ids = new Set<string>();
    for (const item of group.optionPool) {
      if (!item.id?.trim() || !item.text?.trim() || ids.has(item.id)) {
        errors.push(err("INVALID_OPTION_POOL", path, `Group "${group.groupId}" has an empty or duplicate option-pool item.`, groupLoc));
        break;
      }
      ids.add(item.id);
    }
  }

  if (family === "matching_style" || isWordBankGroup(group)) {
    for (const question of group.questions) {
      if (!question.groupId) {
        errors.push(err("MISSING_QUESTION_GROUP", path, `Question "${question.id}" must reference its shared option-pool group.`, { ...groupLoc, questionId: question.id }));
      }
    }
    if (!group.optionPool || group.optionPool.length === 0) {
      errors.push(err("MISSING_OPTION_POOL", path, `Group "${group.groupId}" (${group.taskType}) has no option pool.`, groupLoc));
    } else {
      // REUSE-AWARE COUNT RULE.
      //
      // The original rule was "pool >= questions", on the reasoning that a
      // smaller pool leaves some question without a unique answer. That holds
      // only while each option may be used ONCE. Real IELTS Matching
      // Information tasks routinely carry "NB You may use any letter more
      // than once" -- the reference paper audited in
      // docs/reading-ielts-reference-audit.md matches 10 statements against 9
      // paragraphs -- and under reuse a pool smaller than the question count
      // is correct, not broken.
      //
      // Reuse is inferred from the answer key itself (a repeated
      // correctAnswer within the group) rather than from a new flag, so it
      // needs no schema column and survives the DB round-trip unchanged.
      // When every answer is distinct the original rule applies exactly as
      // before, so no previously-valid content changes meaning and no
      // previously-invalid content becomes valid.
      const answers = group.questions.map((q) => q.correctAnswer);
      const distinctAnswers = new Set(answers);
      const reusesOptions = distinctAnswers.size < answers.length;

      if (!reusesOptions && group.optionPool.length < group.questions.length) {
        errors.push(err("MATCHING_COUNT_MISMATCH", path, `Group "${group.groupId}" has ${group.questions.length} question(s) but only ${group.optionPool.length} option(s) in its pool.`, groupLoc));
      } else if (reusesOptions && group.optionPool.length < distinctAnswers.size) {
        // Even under reuse the pool must be able to supply every answer used.
        errors.push(err("MATCHING_COUNT_MISMATCH", path, `Group "${group.groupId}" uses ${distinctAnswers.size} distinct option(s) but its pool contains only ${group.optionPool.length}.`, groupLoc));
      }
    }
  } else if (group.optionPool && group.optionPool.length > 0) {
    errors.push(err("UNEXPECTED_OPTION_POOL", path, `Group "${group.groupId}" (${group.taskType}) cannot carry an option pool.`, groupLoc));
  }

  if (isWordBankGroup(group)) {
    for (const question of group.questions) {
      if (question.wordLimit || (question.acceptedAnswers?.length ?? 0) > 0) {
        errors.push(err(
          "WORD_BANK_METADATA_CONFLICT",
          path,
          `Word-bank question "${question.id}" must use a pool id only; word limits and accepted-answer variants are not applicable.`,
          { ...groupLoc, questionId: question.id },
        ));
      }
    }
  }

  group.questions.forEach((question, i) => {
    errors.push(...validateQuestion(question, { expectedParentId: context.expectedParentId, expectedSkill: context.expectedSkill, optionPool: group.optionPool }, `${path}.questions[${i}]`));
  });

  return errors;
}

// ── Passage / section-level validation ────────────────────────────────────

function allQuestions(groups: MockQuestionGroupContract[]): MockQuestionContract[] {
  return groups.flatMap((g) => g.questions);
}

function checkDuplicateIdsAndText(questions: MockQuestionContract[], path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenIds = new Map<string, number>();
  const seenText = new Map<string, number>();

  for (const q of questions) {
    seenIds.set(q.id, (seenIds.get(q.id) ?? 0) + 1);
    if (q.questionText) {
      const key = normalizeText(q.questionText);
      seenText.set(key, (seenText.get(key) ?? 0) + 1);
    }
  }

  for (const [id, count] of seenIds) {
    if (count > 1) errors.push(err("DUPLICATE_QUESTION_ID", path, `Question id "${id}" appears ${count} times.`, { questionId: id }));
  }
  for (const [text, count] of seenText) {
    if (count > 1) errors.push(err("DUPLICATE_QUESTION_TEXT", path, `Question text "${text}" appears ${count} times within the same structural parent.`));
  }

  return errors;
}

export function validatePassage(passage: MockPassageContract, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const loc = { passageId: passage.id };
  const questions = allQuestions(passage.questionGroups);

  // 16: passage with zero questions.
  if (questions.length === 0) {
    errors.push(err("EMPTY_PASSAGE", path, `Passage "${passage.id}" has no questions.`, loc));
  }

  errors.push(...checkDuplicateIdsAndText(questions, path));

  passage.questionGroups.forEach((group, i) => {
    errors.push(...validateQuestionGroup(group, { expectedParentId: passage.id, expectedSkill: "reading" }, `${path}.questionGroups[${i}]`));
  });

  return errors;
}

export function validateListeningSection(section: MockListeningSectionContract, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const loc = { sectionId: section.id };
  const questions = allQuestions(section.questionGroups);

  // 17: listening section with zero questions.
  if (questions.length === 0) {
    errors.push(err("EMPTY_SECTION", path, `Listening section "${section.id}" has no questions.`, loc));
  }

  errors.push(...checkDuplicateIdsAndText(questions, path));

  section.questionGroups.forEach((group, i) => {
    errors.push(...validateQuestionGroup(group, { expectedParentId: section.id, expectedSkill: "listening" }, `${path}.questionGroups[${i}]`));
  });

  return errors;
}

// ── Full-mock-level validation ─────────────────────────────────────────────

export function validateReadingMock(content: MockReadingContentContract): ValidationResult {
  const errors: ValidationError[] = [];

  // 18: wrong passage count.
  if (content.passages.length !== READING_PASSAGE_COUNT) {
    errors.push(err("WRONG_PASSAGE_COUNT", "reading.passages", `Expected exactly ${READING_PASSAGE_COUNT} passages, found ${content.passages.length}.`));
  }

  content.passages.forEach((passage, i) => {
    errors.push(...validatePassage(passage, `reading.passages[${i}]`));
  });

  // 5: duplicate question ids across the WHOLE mock, not just within one passage.
  const allIds = content.passages.flatMap((p) => allQuestions(p.questionGroups).map((q) => q.id));
  const totalQuestions = allIds.length;
  const idCounts = new Map<string, number>();
  for (const id of allIds) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  for (const [id, count] of idCounts) {
    if (count > 1) errors.push(err("DUPLICATE_QUESTION_ID", "reading", `Question id "${id}" appears ${count} times across the Reading mock.`, { questionId: id }));
  }

  // 20: wrong total question count.
  if (totalQuestions !== READING_QUESTION_COUNT) {
    errors.push(err("WRONG_READING_QUESTION_COUNT", "reading", `Expected exactly ${READING_QUESTION_COUNT} reading questions, found ${totalQuestions}.`));
  }

  return { valid: errors.length === 0, errors };
}

export function validateListeningMock(content: MockListeningContentContract): ValidationResult {
  const errors: ValidationError[] = [];

  // 19: wrong section count.
  if (content.sections.length !== LISTENING_SECTION_COUNT) {
    errors.push(err("WRONG_SECTION_COUNT", "listening.sections", `Expected exactly ${LISTENING_SECTION_COUNT} sections, found ${content.sections.length}.`));
  }

  content.sections.forEach((section, i) => {
    errors.push(...validateListeningSection(section, `listening.sections[${i}]`));
  });

  const allIds = content.sections.flatMap((s) => allQuestions(s.questionGroups).map((q) => q.id));
  const totalQuestions = allIds.length;
  const idCounts = new Map<string, number>();
  for (const id of allIds) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  for (const [id, count] of idCounts) {
    if (count > 1) errors.push(err("DUPLICATE_QUESTION_ID", "listening", `Question id "${id}" appears ${count} times across the Listening mock.`, { questionId: id }));
  }

  // 21: wrong total question count.
  if (totalQuestions !== LISTENING_QUESTION_COUNT) {
    errors.push(err("WRONG_LISTENING_QUESTION_COUNT", "listening", `Expected exactly ${LISTENING_QUESTION_COUNT} listening questions, found ${totalQuestions}.`));
  }

  return { valid: errors.length === 0, errors };
}

export function validateFullMockContent(content: MockFullContentContract): ValidationResult {
  const reading = validateReadingMock(content.reading);
  const listening = validateListeningMock(content.listening);
  const errors = [...reading.errors, ...listening.errors];
  return { valid: errors.length === 0, errors };
}

// ── Assembly-time adapter: re-hydrate flat DB rows into the SAME contract ──

/** Shape of one already-persisted assessment_questions row, as read by the
 * assembler/engine (or a future assembly-time safety check) — column names
 * match supabase/assessment-schema.sql + mock-structure-schema.sql +
 * mock-question-content-schema.sql exactly. */
export interface AssembledQuestionRow {
  id: string;
  skill: "reading" | "listening";
  type: string;
  question: string;
  options: unknown;
  correct_answer: string;
  accepted_answers: unknown;
  answer_word_limit: string | null;
  option_pool: unknown;
  mock_group_id: string | null;
  /** Shared task instruction for this row's group — see
   * supabase/mock-group-instructions-schema.sql. Optional on this interface so
   * a caller reading a database where that migration has not yet been applied
   * can still build a row. */
  mock_group_instructions?: string | null;
  mock_sequence: number | null;
  difficulty: MockQuestionContract["difficulty"];
  mock_passage_id: string | null;
  mock_listening_section_id: string | null;
}

interface AssembledParentRow {
  id: string;
  title: string | null;
  difficulty: MockPassageContract["difficulty"];
  /** mock_passages.body_text or mock_listening_sections.transcript, if the
   * caller has it loaded. Not consulted by any validation rule today (only
   * question counts/structure are checked), so callers that only have ids
   * on hand may omit it. */
  bodyText?: string | null;
}

function compareRowsBySequence(a: AssembledQuestionRow, b: AssembledQuestionRow): number {
  const aSequence = Number.isInteger(a.mock_sequence) && (a.mock_sequence ?? 0) > 0 ? a.mock_sequence : null;
  const bSequence = Number.isInteger(b.mock_sequence) && (b.mock_sequence ?? 0) > 0 ? b.mock_sequence : null;
  if (aSequence !== null && bSequence !== null && aSequence !== bSequence) return aSequence - bSequence;
  if (aSequence !== null && bSequence === null) return -1;
  if (aSequence === null && bSequence !== null) return 1;
  return a.id.localeCompare(b.id);
}

function validateSequences(rows: AssembledQuestionRow[], path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<number, string>();
  for (const row of rows) {
    if (row.mock_sequence === null) continue;
    if (!Number.isInteger(row.mock_sequence) || row.mock_sequence <= 0) {
      errors.push(err("INVALID_MOCK_SEQUENCE", path, `Question "${row.id}" has invalid mock_sequence=${row.mock_sequence}; expected a positive integer.`, { questionId: row.id }));
      continue;
    }
    const previous = seen.get(row.mock_sequence);
    if (previous) {
      errors.push(err("DUPLICATE_MOCK_SEQUENCE", path, `Questions "${previous}" and "${row.id}" both use mock_sequence=${row.mock_sequence} within one structural parent.`, { questionId: row.id }));
    } else {
      seen.set(row.mock_sequence, row.id);
    }
  }
  return errors;
}

function rowsToGroups(rows: AssembledQuestionRow[], skill: "reading" | "listening"): { groups: MockQuestionGroupContract[]; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const byGroupKey = new Map<string, AssembledQuestionRow[]>();
  // A row with no mock_group_id is its own standalone group, keyed by its own id.
  for (const row of rows) {
    const key = row.mock_group_id ?? `__standalone__${row.id}`;
    const list = byGroupKey.get(key) ?? [];
    list.push(row);
    byGroupKey.set(key, list);
  }

  const groups: MockQuestionGroupContract[] = [];
  const orderedEntries = [...byGroupKey.entries()].sort(([, a], [, b]) =>
    compareRowsBySequence([...a].sort(compareRowsBySequence)[0], [...b].sort(compareRowsBySequence)[0]));
  for (const [key, groupRows] of orderedEntries) {
    const sorted = [...groupRows].sort(compareRowsBySequence);
    const parsedPools = sorted.map((row) => {
      if (row.option_pool === null || row.option_pool === undefined) return null;
      if (isMockOptionPool(row.option_pool)) return row.option_pool;
      errors.push(err("INVALID_OPTION_POOL", `${skill}.groups[${key}]`, `Question "${row.id}" has a malformed option_pool.`, { groupId: key, questionId: row.id }));
      return null;
    });
    const pools = parsedPools.map((pool) => JSON.stringify(pool));
    if (new Set(pools).size > 1) {
      errors.push(err("INCONSISTENT_OPTION_POOL", `${skill}.groups[${key}]`, `Group "${key}" has rows with different option pools — every question in a group must share one identical pool.`, { groupId: key }));
    }
    // Group instructions are denormalized onto every row of the group, exactly
    // like option_pool above, so the same consistency guarantee applies.
    const instructionSet = new Set(sorted.map((r) => r.mock_group_instructions ?? ""));
    if (instructionSet.size > 1) {
      errors.push(err("INCONSISTENT_GROUP_INSTRUCTIONS", `${skill}.groups[${key}]`, `Group "${key}" has rows with different instructions — every question in a group must share one identical instruction text.`, { groupId: key }));
    }
    groups.push({
      groupId: key,
      taskType: sorted[0].type as MockQuestionContract["type"],
      instructions: sorted[0].mock_group_instructions ?? "",
      optionPool: parsedPools[0] ?? undefined,
      questions: sorted.map((row, i) => ({
        id: row.id,
        skill: row.skill,
        type: row.type as MockQuestionContract["type"],
        order: row.mock_sequence ?? i + 1,
        questionText: row.question,
        options: row.options === null || row.options === undefined
          ? undefined
          : isStringArray(row.options)
            ? row.options
            : (errors.push(err("INVALID_OPTIONS", `${skill}.groups[${key}].questions[${i}]`, `Question "${row.id}" has malformed options.`, { groupId: key, questionId: row.id })), undefined),
        correctAnswer: row.correct_answer,
        acceptedAnswers: row.accepted_answers === null || row.accepted_answers === undefined
          ? undefined
          : isStringArray(row.accepted_answers)
            ? row.accepted_answers
            : (errors.push(err("INVALID_ACCEPTED_ANSWERS", `${skill}.groups[${key}].questions[${i}]`, `Question "${row.id}" has malformed accepted_answers.`, { groupId: key, questionId: row.id })), undefined),
        wordLimit: row.answer_word_limit ? wordLimitFromRow(row.answer_word_limit, errors, `${skill}.groups[${key}].questions[${i}]`, row.id) : undefined,
        difficulty: row.difficulty,
        structuralParentId: (skill === "reading" ? row.mock_passage_id : row.mock_listening_section_id) ?? "",
        groupId: row.mock_group_id ?? undefined,
      })),
    });
  }

  return { groups, errors };
}

function wordLimitFromRow(label: string, errors: ValidationError[], path: string, questionId: string): WordLimit | undefined {
  if (!(WORD_LIMIT_DB_LABELS as readonly string[]).includes(label)) {
    errors.push(err("INVALID_WORD_LIMIT_LABEL", path, `Question "${questionId}" has unsupported answer_word_limit="${label}".`, { questionId }));
    return undefined;
  }
  return wordLimitFromDbLabel(label as WordLimitDbLabel);
}

export function buildReadingContractFromRows(passages: AssembledParentRow[], rows: AssembledQuestionRow[]): { contract: MockReadingContentContract; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const contractPassages: MockPassageContract[] = passages.map((p) => {
    const passageRows = rows.filter((r) => r.mock_passage_id === p.id);
    errors.push(...validateSequences(passageRows, `reading.passages[${p.id}]`));
    const { groups, errors: groupErrors } = rowsToGroups(passageRows, "reading");
    errors.push(...groupErrors);
    return {
      id: p.id,
      title: p.title,
      difficulty: p.difficulty,
      bodyText: p.bodyText ?? "",
      questionGroups: groups,
    };
  });
  return { contract: { passages: contractPassages }, errors };
}

export function buildListeningContractFromRows(sections: AssembledParentRow[], rows: AssembledQuestionRow[]): { contract: MockListeningContentContract; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const contractSections: MockListeningSectionContract[] = sections.map((s) => {
    const sectionRows = rows.filter((r) => r.mock_listening_section_id === s.id);
    errors.push(...validateSequences(sectionRows, `listening.sections[${s.id}]`));
    const { groups, errors: groupErrors } = rowsToGroups(sectionRows, "listening");
    errors.push(...groupErrors);
    return {
      id: s.id,
      title: s.title,
      difficulty: s.difficulty,
      transcript: s.bodyText ?? null,
      audioUrl: null,
      questionGroups: groups,
    };
  });
  return { contract: { sections: contractSections }, errors };
}

/**
 * The assembly-time safety check: re-hydrates already-persisted rows into
 * the SAME content contract used before insertion, then runs the SAME
 * validateReadingMock()/validateListeningMock() functions. Intended to be
 * called as a final guard right after (or instead of trusting) an
 * assembleMock() result — NOT YET wired into assembler.ts's own runtime
 * path; that wiring is a deliberate follow-up, out of scope for this task
 * (see this project's own task history: "STOP after the validator/schema
 * layer").
 */
export function validateAssembledMock(
  readingPassages: AssembledParentRow[],
  readingRows: AssembledQuestionRow[],
  listeningSections: AssembledParentRow[],
  listeningRows: AssembledQuestionRow[],
  options: { includeListening?: boolean } = {},
): ValidationResult {
  const { contract: reading, errors: readingAdapterErrors } = buildReadingContractFromRows(readingPassages, readingRows);
  const readingResult = validateReadingMock(reading);
  if (options.includeListening === false) {
    const errors = [...readingAdapterErrors, ...readingResult.errors];
    return { valid: errors.length === 0, errors };
  }

  const { contract: listening, errors: listeningAdapterErrors } = buildListeningContractFromRows(listeningSections, listeningRows);
  const listeningResult = validateListeningMock(listening);

  const errors = [...readingAdapterErrors, ...readingResult.errors, ...listeningAdapterErrors, ...listeningResult.errors];
  return { valid: errors.length === 0, errors };
}
