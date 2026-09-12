/**
 * Full Mock Engine — server-side only.
 *
 * Manages the lifecycle of a full timed mock exam:
 *   startMock   → assemble questions, create full_mock_attempts row, record exposure
 *   saveAnswer  → upsert a single full_mock_responses row (navigable, idempotent)
 *   submitMock  → grade all responses, update attempt with scores, write learning signal
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import type { AssessmentQuestion } from "@/types/assessment";
import type { CefrLevel } from "@/types/content";
import {
  assembleMock,
  LISTENING_QUESTION_COUNT,
  READING_QUESTION_COUNT,
  READING_TIME_LIMIT_SECONDS,
  LISTENING_TIME_LIMIT_SECONDS,
} from "./assembler";
import { scoreMock } from "./scoring";
import {
  ALLOWED_TYPES_BY_SKILL,
  familyOf,
  isKnownMockQuestionType,
  isMockOptionPool,
  isStringArray,
  wordLimitFromDbLabel,
  WORD_LIMIT_DB_LABELS,
  type MockOptionPoolItem,
  type MockQuestionType,
  type WordLimit,
  type WordLimitDbLabel,
} from "./content/types";
import { answersMatch, normalizeAnswer, violatesWordLimit } from "./content/normalization";

/** Any type a persisted Mock/legacy question may carry -- the contract's 13
 * plus the three legacy generic values, matching the DB's widened CHECK
 * (supabase/mock-question-content-schema.sql). No new type names invented. */
type MockRuntimeQuestionType = MockQuestionType | AssessmentQuestion["type"];

/** Decodes assessment_questions.answer_word_limit using the contract's OWN
 * label set + converter -- never a re-implementation. An unrecognised or
 * absent label yields null (the normal state for non-completion questions). */
export function decodeWordLimit(label: string | null): WordLimit | null {
  if (!label) return null;
  return (WORD_LIMIT_DB_LABELS as readonly string[]).includes(label)
    ? wordLimitFromDbLabel(label as WordLimitDbLabel)
    : null;
}

interface ReadingGradingRow {
  correct_answer: string;
  type: string;
  accepted_answers: unknown;
  answer_word_limit: string | null;
  option_pool: unknown;
}

/** Server-side Reading grader. Contract question types all use the same
 * conservative normalization rules. Free-text completion additionally fails
 * closed when its declared word limit is absent, invalid, or exceeded. */
export function gradeReadingAnswer(row: ReadingGradingRow, userAnswer: string | null): boolean {
  if (userAnswer === null || typeof row.correct_answer !== "string") return false;

  // Preserve legacy Placement/Practice-shaped Mock rows exactly as before.
  if (!isKnownMockQuestionType(row.type)) {
    return userAnswer.trim().toLowerCase() === row.correct_answer.trim().toLowerCase();
  }
  if (!ALLOWED_TYPES_BY_SKILL.reading.includes(row.type)) return false;

  const family = familyOf(row.type);
  if (family !== "completion") return answersMatch(userAnswer, row.correct_answer);

  if (row.option_pool !== null && row.option_pool !== undefined) {
    if (!isMockOptionPool(row.option_pool) || row.option_pool.length === 0) return false;
    return answersMatch(userAnswer, row.correct_answer);
  }

  const limit = decodeWordLimit(row.answer_word_limit);
  if (!limit || violatesWordLimit(userAnswer, limit)) return false;
  if (row.accepted_answers !== null && row.accepted_answers !== undefined && !isStringArray(row.accepted_answers)) return false;
  return answersMatch(userAnswer, row.correct_answer, row.accepted_answers ?? []);
}

/** Listening keeps its existing single-answer comparison, while completion
 * rows now enforce the same authored word-limit and accepted-answer contract
 * as Reading. */
export function gradeListeningAnswer(row: ReadingGradingRow, userAnswer: string | null): boolean {
  if (userAnswer === null || typeof row.correct_answer !== "string") return false;

  if (!isKnownMockQuestionType(row.type)) {
    return userAnswer.trim().toLowerCase() === row.correct_answer.trim().toLowerCase();
  }
  if (!ALLOWED_TYPES_BY_SKILL.listening.includes(row.type)) return false;

  if (familyOf(row.type) !== "completion") {
    return userAnswer.trim().toLowerCase() === row.correct_answer.trim().toLowerCase();
  }
  if (row.option_pool !== null && row.option_pool !== undefined) {
    if (!isMockOptionPool(row.option_pool) || row.option_pool.length === 0) return false;
    return answersMatch(userAnswer, row.correct_answer);
  }

  const limit = decodeWordLimit(row.answer_word_limit);
  if (!limit || violatesWordLimit(userAnswer, limit)) return false;
  if (row.accepted_answers !== null && row.accepted_answers !== undefined && !isStringArray(row.accepted_answers)) return false;
  return answersMatch(userAnswer, row.correct_answer, row.accepted_answers ?? []);
}

export interface ListeningChooseTwoGradingItem {
  questionId: string;
  type: string;
  groupId: string | null;
  mockSequence: number | null;
  optionPool: unknown;
  correctAnswer: string;
  userAnswer: string | null;
}

/** Returns one boolean per persisted response row. Correct selections earn
 * one mark each regardless of row order; a repeated selection can earn at
 * most one mark. Malformed groups fail closed. */
export function gradeListeningChooseTwoGroup(
  items: ListeningChooseTwoGradingItem[],
): Array<{ questionId: string; isCorrect: boolean }> {
  const orderedItems = [...items].sort((left, right) => (left.mockSequence ?? 0) - (right.mockSequence ?? 0));
  const failClosed = () => orderedItems.map((item) => ({ questionId: item.questionId, isCorrect: false }));
  if (orderedItems.length !== 2) return failClosed();

  const groupId = orderedItems[0].groupId;
  const pools = orderedItems.map((item) => item.optionPool);
  if (!groupId
    || orderedItems.some((item) => item.type !== "multiple_choice" || item.groupId !== groupId)
    || !pools.every((pool) => isMockOptionPool(pool) && pool.length >= 3)
    || JSON.stringify(pools[0]) !== JSON.stringify(pools[1])) {
    return failClosed();
  }

  const sequences = orderedItems.map((item) => item.mockSequence);
  if (sequences.some((sequence) => !Number.isInteger(sequence) || (sequence ?? 0) <= 0)
    || sequences[1]! !== sequences[0]! + 1) {
    return failClosed();
  }

  const poolIds = new Set((pools[0] as MockOptionPoolItem[]).map((option) => normalizeAnswer(option.id)));
  const correctAnswers = orderedItems.map((item) => normalizeAnswer(item.correctAnswer));
  if (new Set(correctAnswers).size !== 2 || correctAnswers.some((answer) => !poolIds.has(answer))) {
    return failClosed();
  }

  const correctSet = new Set(correctAnswers);
  const creditedSelections = new Set<string>();
  return orderedItems.map((item) => {
    if (item.userAnswer === null) return { questionId: item.questionId, isCorrect: false };
    const selected = normalizeAnswer(item.userAnswer);
    const isCorrect = !creditedSelections.has(selected) && correctSet.has(selected);
    creditedSelections.add(selected);
    return { questionId: item.questionId, isCorrect };
  });
}

/** A question as returned by fetchQuestionsForIds(), extended with its
 * structural parent -- see supabase/mock-structure-schema.sql. Every
 * question assembleMock() selects always has exactly one of these set,
 * since the assembler only ever selects grouped questions; both are
 * exposed (rather than one skill-specific field) so callers never have to
 * guess which one applies. */
interface StructuralQuestion extends Omit<AssessmentQuestion, "type"> {
  /** Widened from AssessmentQuestion's legacy 'mc'|'tf'|'fill' -- Omit+redeclare
   * because TypeScript cannot widen an inherited member. AssessmentQuestion
   * itself is untouched, so Placement/Practice are unaffected. */
  type: MockRuntimeQuestionType;
  passageId: string | null;
  sectionId: string | null;
  /** Shared pool for matching/labelling-family questions. Client-safe: it is
   * the set of choices the learner picks FROM, not the answer. */
  optionPool: MockOptionPoolItem[] | null;
  wordLimit: WordLimit | null;
  groupId: string | null;
  mockSequence: number | null;
}

/** Which sections this attempt covers. "full" is the unchanged
 * Reading+Listening mock and stays the default, so every existing caller
 * behaves exactly as before. */
export type MockSections = "full" | "reading_only";

export interface MockStartInput {
  userId: string;
  targetCefrLevel: CefrLevel;
  planTaskId?: string | null;
  sections?: MockSections;
}

/**
 * True when an attempt recorded no listening questions at all -- i.e. it was
 * assembled as Reading-only. Derived from the attempt's OWN persisted
 * structure rather than a separate mode column, so no migration is needed and
 * there is no way for a stored flag to disagree with the stored question ids.
 */
export function isReadingOnlyAttempt(listeningQuestionIds: readonly string[] | null | undefined): boolean {
  return (listeningQuestionIds ?? []).length === 0;
}

export interface MockQuestion extends Omit<AssessmentQuestion, "type"> {
  /** See StructuralQuestion.type -- the contract's 13 types plus the legacy three. */
  type: MockRuntimeQuestionType;
  section: "reading" | "listening";
  sequenceNumber: number;
  /** The passage this question belongs to (reading) -- null for a listening question. */
  passageId: string | null;
  /** The section this question belongs to (listening) -- null for a reading question. */
  sectionId: string | null;
  /** Shared choice pool for matching/labelling questions -- never the answer. */
  optionPool: MockOptionPoolItem[] | null;
  /** Word-limit guidance for completion questions; shown to the learner, exactly as real IELTS does. */
  wordLimit: WordLimit | null;
  groupId: string | null;
  mockSequence: number | null;
}

export interface MockSession {
  attemptId: string;
  readingQuestions: MockQuestion[];
  listeningQuestions: MockQuestion[];
  /** Exactly READING_PASSAGE_COUNT ids, in the order assembleMock() selected them. */
  readingPassageIds: string[];
  /** Exactly LISTENING_SECTION_COUNT ids, in the order assembleMock() selected them. */
  listeningSectionIds: string[];
  readingTimeLimitSeconds: number;
  listeningTimeLimitSeconds: number;
}

export interface SaveAnswerInput {
  attemptId: string;
  userId: string;
  questionId: string;
  section: "reading" | "listening";
  userAnswer: string | null;
  sequenceNumber: number;
}

export interface MockSubmitInput {
  attemptId: string;
  userId: string;
}

export interface MockSubmitResult {
  attemptId: string;
  readingCorrect: number;
  readingTotal: number;
  listeningCorrect: number;
  listeningTotal: number;
  overallScorePct: number;
  estimatedBand: number;
  resultCefrLevel: CefrLevel;
}

// ── Question hydration ────────────────────────────────────────────────────────

async function fetchQuestionsForIds(ids: string[]): Promise<StructuralQuestion[]> {
  if (ids.length === 0) return [];
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("assessment_questions")
    .select("id, skill, type, difficulty, passage, passage_title, audio_url, question, options, correct_answer, explanation, mock_passage_id, mock_listening_section_id, option_pool, answer_word_limit, mock_group_id, mock_sequence")
    .in("id", ids);

  if (!data) return [];

  // NOTE: accepted_answers is deliberately NOT selected here. This function
  // hydrates the CLIENT-facing question set (startMock's return value is
  // serialized straight to the browser), and accepted_answers is answer data
  // -- shipping it would defeat the same anti-cheat rule that already forces
  // correctAnswer/explanation to be blanked below. submitMock() reads it
  // separately, server-side only, at grading time.
  type QRow = {
    id: string; skill: string; type: string; difficulty: string;
    passage: string | null; passage_title: string | null; audio_url: string | null;
    question: string; options: unknown; correct_answer: string; explanation: string | null;
    mock_passage_id: string | null; mock_listening_section_id: string | null;
    option_pool: unknown; answer_word_limit: string | null;
    mock_group_id: string | null; mock_sequence: number | null;
  };
  const byId = new Map((data as QRow[]).map((q) => [q.id, q]));

  // Preserve the original insertion order (assembled order = intended question order)
  return ids
    .map((id) => byId.get(id))
    .filter((q): q is QRow => q !== undefined)
    .map((q) => ({
      id: q.id,
      skill: q.skill as AssessmentQuestion["skill"],
      type: q.type as MockRuntimeQuestionType,
      difficulty: q.difficulty as CefrLevel,
      passage: q.passage ?? null,
      passageTitle: q.passage_title ?? null,
      audioUrl: q.audio_url ?? null,
      question: q.question,
      options: Array.isArray(q.options) ? (q.options as string[]) : null,
      correctAnswer: "",          // never sent to client
      explanation: null,           // never sent to client
      // section_instruction/question_instruction/audio_instruction don't
      // exist in the live DB — see src/lib/assessment/engine.ts.
      sectionInstruction: null,
      questionInstruction: null,
      audioInstruction: null,
      passageId: q.mock_passage_id ?? null,
      sectionId: q.mock_listening_section_id ?? null,
      optionPool: Array.isArray(q.option_pool) ? (q.option_pool as MockOptionPoolItem[]) : null,
      wordLimit: decodeWordLimit(q.answer_word_limit),
      groupId: q.mock_group_id ?? null,
      mockSequence: q.mock_sequence ?? null,
    }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startMock(input: MockStartInput): Promise<MockSession> {
  const supabase = createServiceClient();

  // assembleMock() is the ONLY source of truth for structure: it already
  // guarantees exactly 3 reading passages / exactly 40 reading questions
  // and, for a FULL mock, exactly 4 listening sections / exactly 40
  // listening questions, or throws (see assembler.ts) -- there is no
  // partial/flat fallback left to handle here. In "reading_only" mode the
  // listening half is skipped entirely; the Reading guarantees are identical.
  const readingOnly = input.sections === "reading_only";
  const { readingIds, listeningIds, readingPassageIds, listeningSectionIds } = await assembleMock(
    input.userId,
    input.targetCefrLevel,
    { includeListening: !readingOnly },
  );

  // Create attempt row. reading_passage_ids/listening_section_ids are
  // persisted here, once, from the server's own assembly result -- never
  // from client input (there is none at this point in the flow) -- so the
  // Reading/Listening pages can reconstruct the exact same structure on
  // every future load without re-running selection logic.
  const { data: attempt, error } = await supabase
    .from("full_mock_attempts")
    .insert({
      user_id: input.userId,
      plan_task_id: input.planTaskId ?? null,
      target_cefr_level: input.targetCefrLevel,
      reading_question_ids: readingIds,
      listening_question_ids: listeningIds,
      reading_passage_ids: readingPassageIds,
      // NULL, never [] -- full_mock_attempts_listening_section_count_check is
      // "IS NULL OR cardinality = 4" (mock-attempt-structure.sql), so an empty
      // array would violate it. NULL is the schema's own representation of
      // "this attempt has no listening structure", which is exactly the
      // reading-only case and needs no migration.
      listening_section_ids: readingOnly ? null : listeningSectionIds,
      reading_time_limit_seconds: READING_TIME_LIMIT_SECONDS,
      listening_time_limit_seconds: LISTENING_TIME_LIMIT_SECONDS,
    })
    .select("id")
    .single();

  if (error || !attempt) throw new Error("Failed to create mock attempt");

  // Pre-insert response placeholders (so the client can upsert answers freely)
  const responseRows = [
    ...readingIds.map((qId, i) => ({
      attempt_id: attempt.id,
      question_id: qId,
      section: "reading" as const,
      sequence_number: i + 1,
    })),
    ...listeningIds.map((qId, i) => ({
      attempt_id: attempt.id,
      question_id: qId,
      section: "listening" as const,
      sequence_number: i + 1,
    })),
  ];

  await supabase.from("full_mock_responses").insert(responseRows);

  // Record exposure
  const exposureRows = [...readingIds, ...listeningIds].map((qId) => ({
    user_id: input.userId,
    question_id: qId,
    context: "mock" as const,
  }));
  await supabase.from("question_exposure").insert(exposureRows);

  // Hydrate questions
  const [readingQs, listeningQs] = await Promise.all([
    fetchQuestionsForIds(readingIds),
    fetchQuestionsForIds(listeningIds),
  ]);

  return {
    attemptId: attempt.id,
    readingQuestions: readingQs.map((q, i) => ({ ...q, section: "reading" as const, sequenceNumber: i + 1 })),
    // Strip passage (transcript) from listening questions — never sent to client
    listeningQuestions: listeningQs.map((q, i) => ({
      ...q,
      passage: null,
      passageTitle: null,
      section: "listening" as const,
      sequenceNumber: i + 1,
    })),
    readingPassageIds,
    listeningSectionIds,
    readingTimeLimitSeconds: READING_TIME_LIMIT_SECONDS,
    listeningTimeLimitSeconds: LISTENING_TIME_LIMIT_SECONDS,
  };
}

export async function saveAnswer(input: SaveAnswerInput): Promise<void> {
  const supabase = createServiceClient();

  // Verify ownership
  const { data: attempt } = await supabase
    .from("full_mock_attempts")
    .select("id, user_id, status, reading_question_ids, listening_question_ids")
    .eq("id", input.attemptId)
    .single();

  if (!attempt || attempt.user_id !== input.userId) throw new Error("Attempt not found");
  if (attempt.status !== "in_progress") throw new Error("Attempt already submitted");

  const recordedIds = input.section === "reading"
    ? (attempt.reading_question_ids as string[] | null) ?? []
    : (attempt.listening_question_ids as string[] | null) ?? [];
  const recordedIndex = recordedIds.indexOf(input.questionId);
  if (recordedIndex < 0 || input.sequenceNumber !== recordedIndex + 1) {
    throw new Error("Question does not belong to this attempt at the supplied section and sequence");
  }

  // Update the placeholder created by startMock(); client input can never add
  // a new question to the attempt's authoritative structure.
  const { error } = await supabase
    .from("full_mock_responses")
    .update({ user_answer: input.userAnswer, answered_at: new Date().toISOString() })
    .eq("attempt_id", input.attemptId)
    .eq("question_id", input.questionId)
    .eq("section", input.section);
  if (error) throw new Error(`Failed to save mock answer: ${error.message}`);
}

export async function submitMock(input: MockSubmitInput): Promise<MockSubmitResult> {
  const supabase = createServiceClient();

  // Verify attempt
  const { data: attempt } = await supabase
    .from("full_mock_attempts")
    .select("id, user_id, status, target_cefr_level, reading_question_ids, listening_question_ids, plan_task_id")
    .eq("id", input.attemptId)
    .single();

  if (!attempt || attempt.user_id !== input.userId) throw new Error("Attempt not found");
  if (attempt.status !== "in_progress") throw new Error("Attempt already submitted");

  // Fetch all responses
  const { data: responses, error: responsesError } = await supabase
    .from("full_mock_responses")
    .select("question_id, section, user_answer")
    .eq("attempt_id", input.attemptId);
  if (responsesError) throw new Error(`Mock submission failed: could not load responses (${responsesError.message}).`);

  const recordedReadingIds = (attempt.reading_question_ids as string[] | null) ?? [];
  const recordedListeningIds = (attempt.listening_question_ids as string[] | null) ?? [];
  const allQuestionIds = [
    ...recordedReadingIds,
    ...recordedListeningIds,
  ];
  const responseRows = (responses ?? []) as { question_id: string; section: string; user_answer: string | null }[];
  const expectedReadingIds = new Set(recordedReadingIds);
  const expectedListeningIds = new Set(recordedListeningIds);
  if (recordedReadingIds.length !== READING_QUESTION_COUNT || expectedReadingIds.size !== READING_QUESTION_COUNT
    || (recordedListeningIds.length !== 0 && recordedListeningIds.length !== LISTENING_QUESTION_COUNT)
    || expectedListeningIds.size !== recordedListeningIds.length) {
    throw new Error("Mock submission failed: the attempt's recorded question structure is invalid.");
  }
  const readingResponseCount = responseRows.filter((response) => response.section === "reading").length;
  const listeningResponseCount = responseRows.filter((response) => response.section === "listening").length;
  const expectedListeningTotal = expectedListeningIds.size;
  if (readingResponseCount !== READING_QUESTION_COUNT || listeningResponseCount !== expectedListeningTotal) {
    throw new Error(
      `Mock submission failed: expected exactly ${READING_QUESTION_COUNT} reading and ${expectedListeningTotal} listening responses, found ${readingResponseCount} and ${listeningResponseCount}.`,
    );
  }

  const seenResponseIds = new Set<string>();
  for (const response of responseRows) {
    const belongsToRecordedSection = response.section === "reading"
      ? expectedReadingIds.has(response.question_id)
      : response.section === "listening" && expectedListeningIds.has(response.question_id);
    if (!belongsToRecordedSection || seenResponseIds.has(response.question_id)) {
      throw new Error(`Mock submission failed: response structure does not match the attempt's recorded question ids (${response.question_id}).`);
    }
    seenResponseIds.add(response.question_id);
  }

  // Fetch correct answers. accepted_answers/type are read HERE (server-side,
  // grading time) and never in the client-facing hydration path above.
  const { data: questions, error: questionsError } = await supabase
    .from("assessment_questions")
    .select("id, correct_answer, type, accepted_answers, answer_word_limit, option_pool, mock_group_id, mock_sequence, mock_listening_section_id")
    .in("id", allQuestionIds);
  if (questionsError) throw new Error(`Mock submission failed: could not load grading metadata (${questionsError.message}).`);

  type GradingRow = ReadingGradingRow & {
    id: string;
    mock_group_id: string | null;
    mock_sequence: number | null;
    mock_listening_section_id: string | null;
  };
  const answerMap = new Map(
    (questions ?? []).map((q) => [(q as GradingRow).id, q as GradingRow])
  );
  if (answerMap.size !== new Set(allQuestionIds).size || allQuestionIds.some((id) => !answerMap.has(id))) {
    throw new Error("Mock submission failed: grading metadata is missing for one or more recorded questions.");
  }

  // Grade
  let readingCorrect = 0, listeningCorrect = 0;
  let readingTotal = 0, listeningTotal = 0;

  const gradedResponses: Array<{ question_id: string; is_correct: boolean }> = [];

  const chooseTwoGrades = new Map<string, boolean>();
  const listeningGroups = new Map<string, ListeningChooseTwoGradingItem[]>();
  for (const response of responseRows.filter((item) => item.section === "listening")) {
    const row = answerMap.get(response.question_id);
    if (!row?.mock_group_id || !row.mock_listening_section_id) continue;
    const scopedGroupId = `${row.mock_listening_section_id}:${row.mock_group_id}`;
    const group = listeningGroups.get(scopedGroupId) ?? [];
    group.push({
      questionId: row.id,
      type: row.type,
      groupId: row.mock_group_id,
      mockSequence: row.mock_sequence,
      optionPool: row.option_pool,
      correctAnswer: row.correct_answer,
      userAnswer: response.user_answer,
    });
    listeningGroups.set(scopedGroupId, group);
  }
  for (const group of listeningGroups.values()) {
    if (!group.some((item) => item.type === "multiple_choice" && item.optionPool != null)) continue;
    for (const grade of gradeListeningChooseTwoGroup(group)) {
      chooseTwoGrades.set(grade.questionId, grade.isCorrect);
    }
  }

  for (const r of responseRows) {
    const row = answerMap.get(r.question_id);
    const correct = row?.correct_answer;
    const groupedGrade = chooseTwoGrades.get(r.question_id);
    const isCorrect = groupedGrade ?? (row != null && correct != null
      ? r.section === "reading"
        ? gradeReadingAnswer(row, r.user_answer ?? null)
        : gradeListeningAnswer(row, r.user_answer ?? null)
      : false);

    if (r.section === "reading") {
      readingTotal++;
      if (isCorrect) readingCorrect++;
    } else {
      listeningTotal++;
      if (isCorrect) listeningCorrect++;
    }
    gradedResponses.push({ question_id: r.question_id, is_correct: isCorrect });
  }

  // Security/integrity guarantee: grading must cover EXACTLY the structure
  // this attempt was assembled with -- never more, never fewer, and never
  // influenced by anything the client sent (the client only ever supplies
  // userAnswer via saveAnswer(), which upserts an EXISTING pre-inserted
  // response row and can neither create a response for a foreign question
  // id nor delete one). If this ever fails, full_mock_responses has drifted
  // from full_mock_attempts's own recorded structure -- a data-integrity
  // bug, not a normal scoring outcome, so this fails loudly rather than
  // silently publishing a score computed over the wrong question set.
  // Reading is ALWAYS exactly READING_QUESTION_COUNT, in every mode -- this
  // requirement is unchanged and deliberately still expressed against the
  // constant, not the recorded array.
  //
  // Listening is checked against this attempt's OWN recorded question ids
  // rather than the constant. For a FULL mock that array holds exactly
  // LISTENING_QUESTION_COUNT ids, so the check is exactly as strict as
  // before; for a reading-only attempt it is empty, so 0 responses is the
  // correct expectation rather than a failure. This is if anything stronger
  // than the old constant comparison: it now also catches an attempt whose
  // responses drifted from its own structure for any reason, in any mode.
  // Counts and exact question-id/section membership were checked before any
  // answer keys were loaded or grades were calculated above.

  const scored = scoreMock(readingCorrect, readingTotal, listeningCorrect, listeningTotal);

  // Update each response with is_correct
  for (const g of gradedResponses) {
    await supabase
      .from("full_mock_responses")
      .update({ is_correct: g.is_correct })
      .eq("attempt_id", input.attemptId)
      .eq("question_id", g.question_id);
  }

  // Update attempt row
  await supabase.from("full_mock_attempts").update({
    status: "submitted",
    reading_correct: readingCorrect,
    reading_total: readingTotal,
    listening_correct: listeningCorrect,
    listening_total: listeningTotal,
    reading_score_pct: scored.reading.scorePct,
    listening_score_pct: scored.listening.scorePct,
    overall_score_pct: scored.overallScorePct,
    estimated_band: scored.estimatedBand,
    result_cefr_level: scored.resultCefrLevel,
    submitted_at: new Date().toISOString(),
  }).eq("id", input.attemptId);

  // Learning signal
  await supabase.from("learning_signals").insert({
    user_id: input.userId,
    type: "mock_completed",
    skill: "mixed",
    topic: attempt.target_cefr_level,
    evidence: {
      attemptId: input.attemptId,
      readingCorrect,
      readingTotal,
      listeningCorrect,
      listeningTotal,
      overallScorePct: scored.overallScorePct,
      estimatedBand: scored.estimatedBand,
      resultCefrLevel: scored.resultCefrLevel,
    },
    source: "mock_engine",
    confidence: 0.85,
  });

  // Mark plan task completed
  if (attempt.plan_task_id) {
    await supabase
      .from("plan_tasks")
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq("id", attempt.plan_task_id);
  }

  return {
    attemptId: input.attemptId,
    readingCorrect,
    readingTotal,
    listeningCorrect,
    listeningTotal,
    overallScorePct: scored.overallScorePct,
    estimatedBand: scored.estimatedBand,
    resultCefrLevel: scored.resultCefrLevel,
  };
}
