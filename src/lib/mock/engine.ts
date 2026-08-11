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
  READING_QUESTION_COUNT,
  LISTENING_QUESTION_COUNT,
  READING_TIME_LIMIT_SECONDS,
  LISTENING_TIME_LIMIT_SECONDS,
} from "./assembler";
import { scoreMock } from "./scoring";

export interface MockStartInput {
  userId: string;
  targetCefrLevel: CefrLevel;
  planTaskId?: string | null;
}

export interface MockQuestion extends AssessmentQuestion {
  section: "reading" | "listening";
  sequenceNumber: number;
}

export interface MockSession {
  attemptId: string;
  readingQuestions: MockQuestion[];
  listeningQuestions: MockQuestion[];
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

async function fetchQuestionsForIds(ids: string[]): Promise<AssessmentQuestion[]> {
  if (ids.length === 0) return [];
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("assessment_questions")
    .select("id, skill, type, difficulty, passage, passage_title, audio_url, question, options, correct_answer, explanation")
    .in("id", ids);

  if (!data) return [];

  type QRow = {
    id: string; skill: string; type: string; difficulty: string;
    passage: string | null; passage_title: string | null; audio_url: string | null;
    question: string; options: unknown; correct_answer: string; explanation: string | null;
  };
  const byId = new Map((data as QRow[]).map((q) => [q.id, q]));

  // Preserve the original insertion order (assembled order = intended question order)
  return ids
    .map((id) => byId.get(id))
    .filter((q): q is QRow => q !== undefined)
    .map((q) => ({
      id: q.id,
      skill: q.skill as AssessmentQuestion["skill"],
      type: q.type as AssessmentQuestion["type"],
      difficulty: q.difficulty as CefrLevel,
      passage: q.passage ?? null,
      passageTitle: q.passage_title ?? null,
      audioUrl: q.audio_url ?? null,
      question: q.question,
      options: Array.isArray(q.options) ? (q.options as string[]) : null,
      correctAnswer: "",          // never sent to client
      explanation: null,           // never sent to client
    }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startMock(input: MockStartInput): Promise<MockSession> {
  const supabase = createServiceClient();

  const { readingIds, listeningIds } = await assembleMock(input.userId, input.targetCefrLevel);

  if (readingIds.length === 0 && listeningIds.length === 0) {
    throw new Error("No questions available for mock assembly");
  }

  // Create attempt row
  const { data: attempt, error } = await supabase
    .from("full_mock_attempts")
    .insert({
      user_id: input.userId,
      plan_task_id: input.planTaskId ?? null,
      target_cefr_level: input.targetCefrLevel,
      reading_question_ids: readingIds,
      listening_question_ids: listeningIds,
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
    listeningQuestions: listeningQs.map((q, i) => ({ ...q, section: "listening" as const, sequenceNumber: i + 1 })),
    readingTimeLimitSeconds: READING_TIME_LIMIT_SECONDS,
    listeningTimeLimitSeconds: LISTENING_TIME_LIMIT_SECONDS,
  };
}

export async function saveAnswer(input: SaveAnswerInput): Promise<void> {
  const supabase = createServiceClient();

  // Verify ownership
  const { data: attempt } = await supabase
    .from("full_mock_attempts")
    .select("id, user_id, status")
    .eq("id", input.attemptId)
    .single();

  if (!attempt || attempt.user_id !== input.userId) throw new Error("Attempt not found");
  if (attempt.status !== "in_progress") throw new Error("Attempt already submitted");

  // Upsert the response row
  await supabase
    .from("full_mock_responses")
    .update({ user_answer: input.userAnswer, answered_at: new Date().toISOString() })
    .eq("attempt_id", input.attemptId)
    .eq("question_id", input.questionId)
    .eq("section", input.section);
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
  const { data: responses } = await supabase
    .from("full_mock_responses")
    .select("question_id, section, user_answer")
    .eq("attempt_id", input.attemptId);

  const allQuestionIds = [
    ...(attempt.reading_question_ids as string[]),
    ...(attempt.listening_question_ids as string[]),
  ];

  // Fetch correct answers
  const { data: questions } = await supabase
    .from("assessment_questions")
    .select("id, correct_answer")
    .in("id", allQuestionIds);

  const answerMap = new Map(
    (questions ?? []).map((q: { id: string; correct_answer: string }) => [q.id, q.correct_answer])
  );

  // Grade
  let readingCorrect = 0, listeningCorrect = 0;
  let readingTotal = 0, listeningTotal = 0;

  const gradedResponses: Array<{ question_id: string; is_correct: boolean }> = [];

  for (const r of (responses ?? []) as { question_id: string; section: string; user_answer: string | null }[]) {
    const correct = answerMap.get(r.question_id);
    const isCorrect = correct != null && r.user_answer != null
      ? r.user_answer.trim().toLowerCase() === correct.trim().toLowerCase()
      : false;

    if (r.section === "reading") {
      readingTotal++;
      if (isCorrect) readingCorrect++;
    } else {
      listeningTotal++;
      if (isCorrect) listeningCorrect++;
    }
    gradedResponses.push({ question_id: r.question_id, is_correct: isCorrect });
  }

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
