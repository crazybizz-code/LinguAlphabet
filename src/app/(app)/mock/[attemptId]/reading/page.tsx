import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service-client";
import { MockReadingClient } from "@/components/mock/MockReadingClient";
import type { ClientQuestion } from "@/components/mock/types";
import { decodeWordLimit, isReadingOnlyAttempt } from "@/lib/mock/engine";
import { READING_PASSAGE_COUNT, READING_QUESTION_COUNT, READING_TIME_LIMIT_SECONDS } from "@/lib/mock/assembler";
import { isMockOptionPool, isStringArray } from "@/lib/mock/content/types";

interface Props {
  params: Promise<{ attemptId: string }>;
}

export default async function MockReadingPage({ params }: Props) {
  const { attemptId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify ownership and status
  const { data: attempt } = await supabase
    .from("full_mock_attempts")
    .select("id, user_id, status, reading_question_ids, reading_passage_ids, listening_question_ids, reading_time_limit_seconds")
    .eq("id", attemptId)
    .single();

  if (!attempt || attempt.user_id !== user.id) redirect("/mock");
  if (attempt.status !== "in_progress") redirect(`/mock/${attemptId}/result`);

  const questionIds = Array.isArray(attempt.reading_question_ids) ? attempt.reading_question_ids as string[] : [];
  // Persisted once by startMock() from the server's own assembly result --
  // reconstructing the passage structure on every load/reload reads THIS,
  // never re-runs selection logic and never trusts anything from the client.
  const passageIds = Array.isArray(attempt.reading_passage_ids) ? attempt.reading_passage_ids as string[] : [];
  if (questionIds.length !== READING_QUESTION_COUNT
    || new Set(questionIds).size !== READING_QUESTION_COUNT
    || passageIds.length !== READING_PASSAGE_COUNT
    || new Set(passageIds).size !== READING_PASSAGE_COUNT) {
    throw new Error("Reading mock could not be loaded: the attempt does not contain exactly 3 unique passages and 40 unique questions.");
  }

  const service = createServiceClient();

  // accepted_answers is deliberately NOT selected -- it is answer data and this
  // row is mapped straight into the client payload. Grading reads it
  // server-side in src/lib/mock/engine.ts's submitMock().
  const BASE_QUESTION_COLUMNS =
    "id, skill, type, difficulty, passage, passage_title, audio_url, question, options, mock_passage_id, option_pool, answer_word_limit, mock_group_id, mock_sequence";

  // mock_group_instructions ships ahead of its migration
  // (supabase/mock-group-instructions-schema.sql). Selecting a column that does
  // not exist makes PostgREST fail the WHOLE query with 42703 -- the exact
  // breakage that forced the hardcoded nulls documented in
  // src/lib/assessment/engine.ts. So: ask for it, and fall back to the base
  // column list if the database has not been migrated yet. Once the migration
  // is applied the retry never fires and this helper can be collapsed back to
  // a single select.
  async function loadQuestions() {
    const withInstructions = await service
      .from("assessment_questions")
      .select(`${BASE_QUESTION_COLUMNS}, mock_group_instructions`)
      .in("id", questionIds);
    if (!withInstructions.error) return withInstructions;
    const missingInstructionsColumn = ["42703", "PGRST204"].includes(withInstructions.error.code)
      && withInstructions.error.message.includes("mock_group_instructions");
    if (!missingInstructionsColumn) throw new Error(`Reading mock could not load questions: ${withInstructions.error.message}`);
    const fallback = await service.from("assessment_questions").select(BASE_QUESTION_COLUMNS).in("id", questionIds);
    if (fallback.error) throw new Error(`Reading mock could not load questions: ${fallback.error.message}`);
    return fallback;
  }

  const [questionResult, passageResult] = await Promise.all([
    loadQuestions(),
    service.from("mock_passages").select("id, title, body_text").in("id", passageIds),
  ]);
  if (passageResult.error) throw new Error(`Reading mock could not load passages: ${passageResult.error.message}`);
  const rawQuestions = questionResult.data;
  const rawPassages = passageResult.data;

  // Restore saved answers
  const { data: responses } = await supabase
    .from("full_mock_responses")
    .select("question_id, user_answer")
    .eq("attempt_id", attemptId)
    .eq("section", "reading");

  const savedAnswers: Record<string, string | null> = {};
  for (const r of responses ?? []) {
    savedAnswers[r.question_id] = r.user_answer ?? null;
  }

  const passagesById = new Map(
    (rawPassages ?? []).map((p) => [p.id, p]),
  );

  // Build ordered questions (preserve DB insertion order)
  const byId = new Map(
    (rawQuestions ?? []).map((q) => [q.id, q]),
  );
  if (byId.size !== READING_QUESTION_COUNT || passagesById.size !== READING_PASSAGE_COUNT) {
    throw new Error("Reading mock could not be loaded: one or more recorded passages or questions are missing.");
  }

  type RawQ = {
    id: string; skill: string; type: string; difficulty: string;
    passage: string | null; passage_title: string | null; audio_url: string | null;
    question: string; options: unknown; mock_passage_id: string | null;
    option_pool: unknown; answer_word_limit: string | null;
    mock_group_id: string | null; mock_sequence: number | null;
    // Absent (not just null) when the group-instructions migration has not
    // been applied and the fallback select above was used.
    mock_group_instructions?: string | null;
  };

  const questions: ClientQuestion[] = questionIds
    .map((id) => byId.get(id) as RawQ | undefined)
    .filter((q): q is RawQ => q !== undefined)
    .map((q, i) => {
      // Real IELTS structure: the shared passage text lives in mock_passages,
      // referenced via mock_passage_id -- NOT in this row's own `passage`
      // column (see supabase/mock-structure-schema.sql). Every question
      // assembleMock() selects always has a matching mock_passage_id, so
      // this lookup should always hit; the fallback to the row's own
      // (legacy) passage/passage_title only guards against a data-integrity
      // anomaly rather than crashing a learner's exam mid-attempt.
      const passageGroup = q.mock_passage_id ? passagesById.get(q.mock_passage_id) : undefined;
      if (!passageGroup || q.skill !== "reading") {
        throw new Error(`Reading mock could not be loaded: question ${q.id} has an invalid passage or skill.`);
      }
      if (q.options !== null && !isStringArray(q.options)) {
        throw new Error(`Reading mock could not be loaded: question ${q.id} has malformed options.`);
      }
      if (q.option_pool !== null && !isMockOptionPool(q.option_pool)) {
        throw new Error(`Reading mock could not be loaded: question ${q.id} has a malformed option pool.`);
      }
      const wordLimit = decodeWordLimit(q.answer_word_limit);
      if (q.answer_word_limit !== null && wordLimit === null) {
        throw new Error(`Reading mock could not be loaded: question ${q.id} has an invalid word limit.`);
      }
      if (q.mock_group_instructions !== undefined
        && q.mock_group_instructions !== null
        && typeof q.mock_group_instructions !== "string") {
        throw new Error(`Reading mock could not be loaded: question ${q.id} has malformed group instructions.`);
      }
      return {
        id: q.id,
        skill: q.skill as "reading" | "listening",
        type: q.type as ClientQuestion["type"],
        difficulty: q.difficulty,
        passage: passageGroup?.body_text ?? q.passage ?? null,
        passageTitle: passageGroup?.title ?? q.passage_title ?? null,
        audioUrl: q.audio_url ?? null,
        question: q.question,
        options: q.options,
        sequenceNumber: i + 1,
        passageId: q.mock_passage_id ?? null,
        sectionId: null,
        optionPool: q.option_pool,
        wordLimit,
        groupId: q.mock_group_id ?? null,
        groupInstructions: q.mock_group_instructions ?? null,
        mockSequence: q.mock_sequence ?? null,
        // section_instruction/question_instruction/audio_instruction don't
        // exist in the live DB — see src/lib/assessment/engine.ts.
        sectionInstruction: null,
        questionInstruction: null,
        audioInstruction: null,
      };
    });

  return (
    <MockReadingClient
      attemptId={attemptId}
      questions={questions}
      savedAnswers={savedAnswers}
      timeLimitSeconds={attempt.reading_time_limit_seconds ?? READING_TIME_LIMIT_SECONDS}
      // Derived from the attempt's own recorded structure -- an attempt with no
      // listening question ids was assembled Reading-only, so finishing Reading
      // submits rather than advancing to /listening.
      readingOnly={isReadingOnlyAttempt(attempt.listening_question_ids as string[] | null)}
    />
  );
}
