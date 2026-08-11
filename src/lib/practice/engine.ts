/**
 * Section Practice Engine — server-side only.
 * Selects a fixed set of 5–10 questions upfront, returns them all to the
 * client. On completion the client sends all answers in one call.
 *
 * Feeds learning_signals and triggers plan adaptation via the adaptor.
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import type { AssessmentQuestion } from "@/types/assessment";
import type { CefrLevel } from "@/types/content";

export type PracticeType = "reading" | "listening" | "vocabulary" | "grammar" | "weak_area";

export interface PracticeStartInput {
  userId: string;
  practiceType: PracticeType;
  targetCefrLevel: CefrLevel;
  planTaskId?: string | null;
  questionCount?: number;
}

export interface PracticeSession {
  sessionId: string;
  questions: AssessmentQuestion[];
}

export interface PracticeResponseInput {
  questionId: string;
  userAnswer: string | null;
  timeTakenSeconds: number | null;
}

export interface PracticeCompleteInput {
  sessionId: string;
  userId: string;
  responses: PracticeResponseInput[];
}

export interface PracticeResult {
  sessionId: string;
  questionCount: number;
  correctCount: number;
  scorePct: number;
  weakAreas: string[];
}

// ── Question selection ────────────────────────────────────────────────────────

function skillForType(type: PracticeType): "reading" | "listening" | "vocabulary" | "grammar" {
  if (type === "reading" || type === "reading_practice" as string) return "reading";
  if (type === "listening" || type === "listening_practice" as string) return "listening";
  if (type === "vocabulary") return "vocabulary";
  if (type === "grammar") return "grammar";
  // weak_area — mix reading + listening; we default to reading questions
  return "reading";
}

async function selectPracticeQuestions(
  practiceType: PracticeType,
  level: CefrLevel,
  count: number,
  userId: string,
): Promise<AssessmentQuestion[]> {
  const supabase = createServiceClient();

  const skill = skillForType(practiceType);

  // For weak_area, pull from both reading and listening
  const skills: Array<"reading" | "listening" | "vocabulary" | "grammar"> =
    practiceType === "weak_area" ? ["reading", "listening"] : [skill];

  // Load recent exposure to avoid repetition (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: exposureRows } = await supabase
    .from("question_exposure")
    .select("question_id")
    .eq("user_id", userId)
    .gte("seen_at", thirtyDaysAgo.toISOString());

  const recentlySeenIds = new Set((exposureRows ?? []).map((r: { question_id: string }) => r.question_id));

  // Fetch candidates: target level ± 1 CEFR step for variety
  const cefrOrder = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
  const levelIdx = cefrOrder.indexOf(level);
  const candidateLevels = [
    cefrOrder[Math.max(0, levelIdx - 1)],
    level,
    cefrOrder[Math.min(5, levelIdx + 1)],
  ].filter((v, i, a) => a.indexOf(v) === i) as CefrLevel[];

  const { data: candidates } = await supabase
    .from("assessment_questions")
    .select("id, skill, type, difficulty, passage, passage_title, audio_url, question, options, correct_answer, explanation")
    .eq("approved", true)
    .eq("deprecated", false)
    .in("skill", skills)
    .in("difficulty", candidateLevels);

  if (!candidates || candidates.length === 0) return [];

  // Prefer questions not recently seen
  const fresh = candidates.filter((q: { id: string }) => !recentlySeenIds.has(q.id));
  const pool = fresh.length >= count ? fresh : candidates;

  // Shuffle and pick
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));

  return picked.map((q: {
    id: string; skill: string; type: string; difficulty: string;
    passage: string | null; passage_title: string | null; audio_url: string | null;
    question: string; options: unknown; correct_answer: string; explanation: string | null;
  }) => ({
    id: q.id,
    skill: q.skill as AssessmentQuestion["skill"],
    type: q.type as AssessmentQuestion["type"],
    difficulty: q.difficulty as CefrLevel,
    passage: q.passage ?? null,
    passageTitle: q.passage_title ?? null,
    audioUrl: q.audio_url ?? null,
    question: q.question,
    options: Array.isArray(q.options) ? (q.options as string[]) : null,
    correctAnswer: q.correct_answer,
    explanation: q.explanation ?? null,
  }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startPracticeSession(input: PracticeStartInput): Promise<PracticeSession> {
  const supabase = createServiceClient();
  const count = Math.min(10, Math.max(5, input.questionCount ?? 7));

  const questions = await selectPracticeQuestions(
    input.practiceType,
    input.targetCefrLevel,
    count,
    input.userId,
  );

  if (questions.length === 0) throw new Error("No questions available for this practice type and level");

  // Create the session row
  const { data: session, error } = await supabase
    .from("practice_sessions")
    .insert({
      user_id: input.userId,
      plan_task_id: input.planTaskId ?? null,
      practice_type: input.practiceType,
      target_cefr_level: input.targetCefrLevel,
      question_count: questions.length,
    })
    .select("id")
    .single();

  if (error || !session) throw new Error("Failed to create practice session");

  // Record exposure for each question
  await supabase.from("question_exposure").insert(
    questions.map((q) => ({
      user_id: input.userId,
      question_id: q.id,
      context: "practice" as const,
    })),
  );

  // Return questions without correct answers or listening transcripts
  return {
    sessionId: session.id,
    questions: questions.map((q) => ({
      ...q,
      correctAnswer: "",
      explanation: null,
      // Never expose the transcript to the client during a listening session
      passage: q.skill === "listening" ? null : q.passage,
      passageTitle: q.skill === "listening" ? null : q.passageTitle,
    })),
  };
}

export async function completePracticeSession(input: PracticeCompleteInput): Promise<PracticeResult> {
  const supabase = createServiceClient();

  // Fetch the session (verify ownership + get metadata)
  const { data: session } = await supabase
    .from("practice_sessions")
    .select("id, user_id, target_cefr_level, question_count, practice_type, status")
    .eq("id", input.sessionId)
    .single();

  if (!session || session.user_id !== input.userId) throw new Error("Session not found");
  if (session.status !== "in_progress") throw new Error("Session already completed");

  // Fetch correct answers for all questions in this session's exposure log
  const questionIds = input.responses.map((r) => r.questionId);
  const { data: questions } = await supabase
    .from("assessment_questions")
    .select("id, correct_answer")
    .in("id", questionIds);

  const answerMap = new Map((questions ?? []).map((q: { id: string; correct_answer: string }) => [q.id, q.correct_answer]));

  // Grade responses
  let correctCount = 0;
  const responseRows: Array<{
    session_id: string;
    question_id: string;
    user_answer: string | null;
    is_correct: boolean;
    time_taken_seconds: number | null;
    sequence_number: number;
  }> = [];

  input.responses.forEach((r, idx) => {
    const correctAnswer = answerMap.get(r.questionId);
    const isCorrect = correctAnswer != null && r.userAnswer != null
      ? r.userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
      : false;
    if (isCorrect) correctCount++;
    responseRows.push({
      session_id: input.sessionId,
      question_id: r.questionId,
      user_answer: r.userAnswer,
      is_correct: isCorrect,
      time_taken_seconds: r.timeTakenSeconds,
      sequence_number: idx + 1,
    });
  });

  const questionCount = input.responses.length;
  const scorePct = questionCount > 0 ? Math.round((correctCount / questionCount) * 100 * 100) / 100 : 0;

  // Detect weak areas from this session
  const weakAreas: string[] = [];
  if (scorePct < 50) {
    weakAreas.push(`${session.practice_type}_comprehension`);
  } else if (scorePct < 70) {
    weakAreas.push(`${session.practice_type}_detail`);
  }

  // Insert responses
  if (responseRows.length > 0) {
    await supabase.from("practice_responses").insert(responseRows);
  }

  // Update session to completed
  await supabase
    .from("practice_sessions")
    .update({
      status: "completed",
      correct_count: correctCount,
      question_count: questionCount,
      score_pct: scorePct,
      weak_areas: weakAreas,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.sessionId);

  // Append learning signal
  await supabase.from("learning_signals").insert({
    user_id: input.userId,
    type: "practice_completed",
    skill: session.practice_type,
    topic: session.target_cefr_level,
    evidence: {
      sessionId: input.sessionId,
      practiceType: session.practice_type,
      questionCount,
      correctCount,
      scorePct,
      weakAreas,
    },
    source: "practice_engine",
    confidence: questionCount >= 5 ? 0.7 : 0.5,
  });

  // Mark plan task completed if linked
  if (scorePct >= 60) {
    await supabase
      .from("practice_sessions")
      .select("plan_task_id")
      .eq("id", input.sessionId)
      .single()
      .then(async ({ data }) => {
        if (data?.plan_task_id) {
          await supabase
            .from("plan_tasks")
            .update({ completed: true, completed_at: new Date().toISOString() })
            .eq("id", data.plan_task_id);
        }
      });
  }

  return { sessionId: input.sessionId, questionCount, correctCount, scorePct, weakAreas };
}
