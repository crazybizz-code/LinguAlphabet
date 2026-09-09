/**
 * Full Mock Assembler — server-side only.
 *
 * Selects a real IELTS Academic structure for a mock exam:
 *   Reading:   exactly READING_PASSAGE_COUNT passages,   exactly READING_QUESTION_COUNT questions total
 *   Listening: exactly LISTENING_SECTION_COUNT sections, exactly LISTENING_QUESTION_COUNT questions total
 *
 * STRUCTURAL MODEL (see supabase/mock-structure-schema.sql for the schema
 * this reads): a question belongs to at most one structural parent --
 * `assessment_questions.mock_passage_id` (reading) or
 * `mock_listening_section_id` (listening), both nullable so every existing
 * Placement/Practice-only question (which sets neither) is unaffected.
 * Only questions that DO set one of these two columns are eligible for the
 * Full Mock at all -- a question with no structural parent cannot satisfy
 * "each question belongs to exactly one passage/section", so it is simply
 * never selected here, exactly as before this migration (it remains fully
 * usable by Placement and Practice, which never touch these columns).
 *
 * GROUP-SUM SELECTION (the actual hard part): this project does not assume
 * or enforce a fixed question count per passage/section anywhere (no
 * "13 per passage" rule) -- see mock-structure-schema.sql's own header
 * comment for why. That means picking "3 passages that sum to exactly 40
 * questions" is a genuine combinatorial search over whatever group sizes
 * actually exist, not a fixed-size pick. findExactGroupCombination() below
 * does that search directly (with pruning), which is correct for any
 * realistic content-bank size (a handful to a few dozen groups) but would
 * need revisiting (e.g. dynamic programming) if the passage/section bank
 * ever grows into the hundreds -- documented on that function, not solved
 * prematurely here.
 *
 * A combination is selected ONLY if it sums to EXACTLY the target question
 * count. This project never truncates a group to make the numbers work --
 * "no group is silently split" is enforced by construction: a group is
 * either used in full or not used at all.
 *
 * Selection rules (unchanged from the flat-pool assembler):
 *   - Only approved, non-deprecated passages/sections AND their questions
 *   - De-prioritise questions the user has seen in the last 60 days
 *     (used here as an exposure-minimising tie-break across otherwise-valid
 *     combinations, since exposure is a per-question fact but the unit of
 *     selection is now a whole group)
 *   - Target the learner's assessed level ±1 CEFR where possible, widening
 *     to the full approved bank if no valid combination exists at that level
 *   - The assembler NEVER returns unapproved/deprecated content, and NEVER
 *     returns fewer than the target count -- it throws instead, explaining
 *     exactly what's missing (not enough approved groups, or no group
 *     combination sums to the target).
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import type { CefrLevel } from "@/types/content";
import { validateAssembledMock, type AssembledQuestionRow } from "./content/validator";

export const READING_PASSAGE_COUNT = 3;
export const READING_QUESTION_COUNT = 40;
export const LISTENING_SECTION_COUNT = 4;
export const LISTENING_QUESTION_COUNT = 40;

/** IELTS Academic Reading is one uninterrupted 60-minute section. */
export const IELTS_ACADEMIC_READING_TIME_LIMIT_MINUTES = 60;
export const READING_TIME_LIMIT_SECONDS = IELTS_ACADEMIC_READING_TIME_LIMIT_MINUTES * 60;
// Listening timing is intentionally unchanged by the Reading hardening work.
export const LISTENING_TIME_LIMIT_SECONDS = 1500;

export interface MockQuestionSet {
  readingIds: string[];
  listeningIds: string[];
  /** The exactly-READING_PASSAGE_COUNT passage ids the reading questions were drawn from. */
  readingPassageIds: string[];
  /** The exactly-LISTENING_SECTION_COUNT section ids the listening questions were drawn from. */
  listeningSectionIds: string[];
}

type ParentRow = { id: string; difficulty: string | null };
type QuestionRow = { id: string; parent_id: string; created_at: string | null; mock_sequence: number | null };

interface QuestionGroup {
  groupId: string;
  questionIds: string[];
  firstSequence: number | null;
  firstCreatedAt: string | null;
}

const CEFR_ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

function candidateLevels(level: CefrLevel): CefrLevel[] {
  const idx = CEFR_ORDER.indexOf(level);
  return [
    CEFR_ORDER[Math.max(0, idx - 1)],
    level,
    CEFR_ORDER[Math.min(5, idx + 1)],
  ].filter((v, i, a) => a.indexOf(v) === i) as CefrLevel[];
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function compareQuestionRows(a: QuestionRow, b: QuestionRow): number {
  const aSequence = Number.isInteger(a.mock_sequence) && (a.mock_sequence ?? 0) > 0 ? a.mock_sequence : null;
  const bSequence = Number.isInteger(b.mock_sequence) && (b.mock_sequence ?? 0) > 0 ? b.mock_sequence : null;
  if (aSequence !== null && bSequence !== null && aSequence !== bSequence) return aSequence - bSequence;
  if (aSequence !== null && bSequence === null) return -1;
  if (aSequence === null && bSequence !== null) return 1;
  const byCreatedAt = (a.created_at ?? "").localeCompare(b.created_at ?? "");
  return byCreatedAt || a.id.localeCompare(b.id);
}

function compareReadingGroups(a: QuestionGroup, b: QuestionGroup): number {
  if (a.firstSequence !== null && b.firstSequence !== null) {
    return a.firstSequence - b.firstSequence || a.groupId.localeCompare(b.groupId);
  }
  if (a.firstSequence !== null && b.firstSequence === null) return -1;
  if (a.firstSequence === null && b.firstSequence !== null) return 1;
  const byCreatedAt = (a.firstCreatedAt ?? "").localeCompare(b.firstCreatedAt ?? "");
  return byCreatedAt || a.groupId.localeCompare(b.groupId);
}

/**
 * Finds a combination of exactly `groupsNeeded` groups from `groups` whose
 * question counts sum to EXACTLY `questionsNeeded`, minimising how many of
 * the selected questions are in `recentIds` (60-day exposure). Returns null
 * if no such combination exists at all.
 *
 * Full combinatorial search with pruning (abandons a partial combination as
 * soon as its running total exceeds the target, since every group
 * contributes a positive count). Correct and fast for any realistic
 * content-bank size -- groupsNeeded is always tiny (3 or 4) and real
 * passage/section counts are small. Would need a smarter algorithm (e.g.
 * meet-in-the-middle or DP over sums) only if the approved-group count for
 * a skill grows into the hundreds; not a concern at this project's current
 * or near-term content scale, and not solved pre-emptively here.
 */
function findExactGroupCombination(
  groups: QuestionGroup[],
  groupsNeeded: number,
  questionsNeeded: number,
  recentIds: Set<string>,
): QuestionGroup[] | null {
  if (groups.length < groupsNeeded) return null;

  function exposureScore(combo: QuestionGroup[]): number {
    let score = 0;
    for (const g of combo) for (const id of g.questionIds) if (recentIds.has(id)) score++;
    return score;
  }

  let bestCombo: QuestionGroup[] | null = null;
  let bestScore = Infinity;
  const chosen: QuestionGroup[] = [];

  function recurse(start: number, remainingGroups: number, remainingQuestions: number): void {
    if (remainingQuestions < 0) return; // every remaining group adds >=1, so this branch can only get worse
    if (remainingGroups === 0) {
      if (remainingQuestions === 0) {
        const score = exposureScore(chosen);
        if (score < bestScore) {
          bestScore = score;
          bestCombo = [...chosen];
        }
      }
      return;
    }
    for (let i = start; i < groups.length; i++) {
      if (groups.length - i < remainingGroups) break; // not enough groups left to fill the combination
      chosen.push(groups[i]);
      recurse(i + 1, remainingGroups - 1, remainingQuestions - groups[i].questionIds.length);
      chosen.pop();
    }
  }

  recurse(0, groupsNeeded, questionsNeeded);
  return bestCombo;
}

/**
 * Loads every approved, non-deprecated question that has a structural
 * parent of the given kind, grouped by parent -- restricted to parents
 * whose own difficulty is in `levels`, unless `levels` is null (the
 * difficulty-unrestricted fallback pass).
 */
async function loadGroups(
  parentTable: "mock_passages" | "mock_listening_sections",
  parentIdColumn: "mock_passage_id" | "mock_listening_section_id",
  skill: "reading" | "listening",
  levels: CefrLevel[] | null,
): Promise<QuestionGroup[]> {
  const supabase = createServiceClient();

  let parentQuery = supabase.from(parentTable).select("id, difficulty").eq("approved", true).eq("deprecated", false);
  if (levels) parentQuery = parentQuery.in("difficulty", levels);
  const { data: parentRows, error: parentError } = await parentQuery;
  if (parentError) throw new Error(`Mock assembly failed: could not load approved ${skill} parents (${parentError.message}).`);
  const parents = (parentRows ?? []) as ParentRow[];
  if (parents.length === 0) return [];

  const parentIds = parents.map((p) => p.id);
  const { data: questionRows, error: questionError } = await supabase
    .from("assessment_questions")
    .select(`id, ${parentIdColumn}, mock_sequence, created_at`)
    .eq("approved", true)
    .eq("deprecated", false)
    .eq("skill", skill)
    .in(parentIdColumn, parentIds);
  if (questionError) throw new Error(`Mock assembly failed: could not load approved ${skill} questions (${questionError.message}).`);

  const byParent = new Map<string, QuestionRow[]>();
  for (const row of (questionRows ?? []) as unknown as Array<{ id: string; created_at: string | null } & Record<string, unknown>>) {
    const parentId = row[parentIdColumn] as string;
    const list = byParent.get(parentId) ?? [];
    list.push({
      id: row.id,
      parent_id: parentId,
      created_at: row.created_at,
      mock_sequence: typeof row.mock_sequence === "number" ? row.mock_sequence : null,
    });
    byParent.set(parentId, list);
  }

  const groups: QuestionGroup[] = [];
  for (const parentId of parentIds) {
    const questions = byParent.get(parentId);
    // A group with zero approved questions can never contribute to a valid
    // combination and is dropped here rather than passed through as an
    // empty, useless candidate.
    if (!questions || questions.length === 0) continue;
    questions.sort(compareQuestionRows);
    groups.push({
      groupId: parentId,
      questionIds: questions.map((q) => q.id),
      firstSequence: questions[0].mock_sequence,
      firstCreatedAt: questions[0].created_at,
    });
  }
  return groups;
}

/**
 * Selects one skill's full structure: tries the CEFR ±1 restricted group
 * set first, widens to every approved group for the skill if no exact
 * combination exists at that level, and throws a specific, actionable
 * error if no valid combination exists even in the widened set.
 */
async function assembleSection(
  parentTable: "mock_passages" | "mock_listening_sections",
  parentIdColumn: "mock_passage_id" | "mock_listening_section_id",
  skill: "reading" | "listening",
  groupsNeeded: number,
  questionsNeeded: number,
  level: CefrLevel,
  recentIds: Set<string>,
): Promise<{ groupIds: string[]; questionIds: string[] }> {
  const levels = candidateLevels(level);

  const restricted = await loadGroups(parentTable, parentIdColumn, skill, levels);
  if (skill === "reading") restricted.sort(compareReadingGroups);
  let combo = findExactGroupCombination(restricted, groupsNeeded, questionsNeeded, recentIds);

  if (!combo) {
    const widened = await loadGroups(parentTable, parentIdColumn, skill, null);
    if (skill === "reading") widened.sort(compareReadingGroups);
    combo = findExactGroupCombination(widened, groupsNeeded, questionsNeeded, recentIds);

    if (!combo) {
      if (widened.length < groupsNeeded) {
        throw new Error(
          `Mock assembly failed: only ${widened.length} approved ${skill} group(s) with at least one approved question exist, but a full mock requires exactly ${groupsNeeded}. Add more approved ${skill} passages/sections before this mock can be assembled.`,
        );
      }
      throw new Error(
        `Mock assembly failed: no combination of exactly ${groupsNeeded} approved ${skill} group(s) has questions summing to exactly ${questionsNeeded}. Group sizes must be authored so some ${groupsNeeded}-group combination totals ${questionsNeeded} questions.`,
      );
    }
  }

  // Reading order is authored data, not presentation randomisation. Keep the
  // selected passages and their questions in the exact same deterministic
  // order. Listening retains its existing shuffled section-id behaviour.
  const orderedCombo = skill === "reading" ? [...combo].sort(compareReadingGroups) : combo;
  const groupIds = skill === "reading"
    ? orderedCombo.map((g) => g.groupId)
    : shuffle(combo.map((g) => g.groupId));
  const questionIds = orderedCombo.flatMap((g) => g.questionIds);

  if (new Set(questionIds).size !== questionIds.length) {
    throw new Error(`Mock assembly failed: duplicate question id(s) selected for ${skill} -- this indicates a data integrity problem, not a normal shortfall.`);
  }

  return { groupIds, questionIds };
}

const READING_VALIDATION_COLUMNS =
  "id, skill, type, question, options, correct_answer, accepted_answers, answer_word_limit, option_pool, mock_group_id, mock_sequence, difficulty, mock_passage_id, mock_listening_section_id";

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, column: string): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204") && (error.message?.includes(column) ?? true);
}

/** Final, read-only guard over the exact Reading structure selected above.
 * It runs before startMock() can create an attempt or exposure rows. */
async function validateReadingSelection(reading: { groupIds: string[]; questionIds: string[] }): Promise<void> {
  const supabase = createServiceClient();
  const parentResult = await supabase
    .from("mock_passages")
    .select("id, title, difficulty, body_text")
    .in("id", reading.groupIds);
  if (parentResult.error) {
    throw new Error(`Reading mock assembly failed: could not hydrate selected passages (${parentResult.error.message}).`);
  }

  const withInstructions = await supabase
    .from("assessment_questions")
    .select(`${READING_VALIDATION_COLUMNS}, mock_group_instructions`)
    .in("id", reading.questionIds);
  let questionData: unknown[] | null = withInstructions.data;
  let questionError: { code?: string; message: string } | null = withInstructions.error;
  if (isMissingColumnError(questionError, "mock_group_instructions")) {
    const fallback = await supabase
      .from("assessment_questions")
      .select(READING_VALIDATION_COLUMNS)
      .in("id", reading.questionIds);
    questionData = fallback.data;
    questionError = fallback.error;
  }
  if (questionError) {
    throw new Error(`Reading mock assembly failed: could not hydrate selected questions (${questionError.message}).`);
  }

  const parentsById = new Map((parentResult.data ?? []).map((row) => [row.id, row]));
  const orderedParents = reading.groupIds
    .map((id) => parentsById.get(id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map((row) => ({
      id: row.id,
      title: row.title,
      difficulty: row.difficulty,
      bodyText: row.body_text,
    }));

  const result = validateAssembledMock(
    orderedParents,
    (questionData ?? []) as AssembledQuestionRow[],
    [],
    [],
    { includeListening: false },
  );
  if (!result.valid) {
    const visibleErrors = result.errors.slice(0, 6).map((error) => `${error.code} at ${error.path}: ${error.message}`);
    const remainder = result.errors.length > visibleErrors.length ? ` (+${result.errors.length - visibleErrors.length} more)` : "";
    throw new Error(`Reading mock assembly failed runtime validation: ${visibleErrors.join("; ")}${remainder}`);
  }
}

/**
 * READING-ONLY MODE: `includeListening: false` assembles the Reading half
 * ONLY and returns empty listening arrays. Everything about Reading is
 * unchanged -- still exactly READING_PASSAGE_COUNT passages summing to
 * exactly READING_QUESTION_COUNT questions, still the same exact-sum search,
 * the same approval/deprecation filters and the same exposure tie-break.
 *
 * Listening is skipped, never relaxed: a FULL mock (the default) still
 * requires exactly LISTENING_SECTION_COUNT sections summing to exactly
 * LISTENING_QUESTION_COUNT questions and still throws when no valid
 * combination exists. There is no mode in which a listening shortfall is
 * silently tolerated.
 */
export interface AssembleMockOptions {
  includeListening?: boolean;
}

export async function assembleMock(userId: string, level: CefrLevel, options: AssembleMockOptions = {}): Promise<MockQuestionSet> {
  const includeListening = options.includeListening ?? true;
  const supabase = createServiceClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const { data: exposureRows } = await supabase
    .from("question_exposure")
    .select("question_id")
    .eq("user_id", userId)
    .gte("seen_at", cutoff.toISOString());
  const recentIds = new Set((exposureRows ?? []).map((r: { question_id: string }) => r.question_id));

  const [reading, listening] = await Promise.all([
    assembleSection("mock_passages", "mock_passage_id", "reading", READING_PASSAGE_COUNT, READING_QUESTION_COUNT, level, recentIds),
    // Skipped entirely in reading-only mode -- mock_listening_sections is not
    // even queried, so a Reading-only mock can be assembled with zero
    // listening content in the bank.
    includeListening
      ? assembleSection("mock_listening_sections", "mock_listening_section_id", "listening", LISTENING_SECTION_COUNT, LISTENING_QUESTION_COUNT, level, recentIds)
      : Promise.resolve({ groupIds: [] as string[], questionIds: [] as string[] }),
  ]);

  await validateReadingSelection(reading);

  return {
    readingIds: reading.questionIds,
    listeningIds: listening.questionIds,
    readingPassageIds: reading.groupIds,
    listeningSectionIds: listening.groupIds,
  };
}
