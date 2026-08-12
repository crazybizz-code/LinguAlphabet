/**
 * Assessment engine — server-side only.
 * Called by the /api/assessment/placement/* routes.
 *
 * The engine is stateless per call: it reconstructs adaptive state by reading
 * all responses for the attempt from the database. This keeps the API simple
 * and makes it robust to network failures mid-session.
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import type { AssessmentQuestion, QuestionResponse, StartResponse, AnswerResponse } from "@/types/assessment";
import type { CefrLevel } from "@/types/content";
import {
  bandToAbilityIndex,
  cefrToAbilityIndex,
  updateAbility,
  selectNext,
  isSessionComplete,
  ESTIMATED_TOTAL_QUESTIONS,
  type QuestionPool,
} from "./adaptive";
import { computePlacementResult } from "./scoring";
import type { SkillState } from "./types";

// ── Question fetching ─────────────────────────────────────────────────────

async function loadQuestionPool(): Promise<QuestionPool[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("assessment_questions")
    .select("id, skill, difficulty")
    .eq("approved", true)
    .eq("deprecated", false);
  return (data ?? []) as QuestionPool[];
}

async function fetchQuestionById(id: string): Promise<AssessmentQuestion | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("assessment_questions")
    .select("id, skill, type, difficulty, passage, passage_title, audio_url, question, options, correct_answer, explanation")
    .eq("id", id)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    skill: data.skill as AssessmentQuestion["skill"],
    type: data.type as AssessmentQuestion["type"],
    difficulty: data.difficulty as CefrLevel,
    passage: data.passage ?? null,
    passageTitle: data.passage_title ?? null,
    audioUrl: data.audio_url ?? null,
    question: data.question,
    options: Array.isArray(data.options) ? (data.options as string[]) : null,
    correctAnswer: data.correct_answer,
    explanation: data.explanation ?? null,
    // section_instruction/question_instruction/audio_instruction don't exist
    // in the live DB (never migrated — see supabase/assessment-schema.sql).
    // Selecting them throws PostgREST 42703, which was breaking every
    // Placement/Mock/Practice question fetch. Hardcoded null keeps every
    // existing UI fallback (?? / &&) working unchanged.
    sectionInstruction: null,
    questionInstruction: null,
    audioInstruction: null,
  };
}

async function fetchQuestionForSlot(
  skill: AssessmentQuestion["skill"],
  level: CefrLevel,
  excludeIds: string[],
): Promise<AssessmentQuestion | null> {
  const supabase = createServiceClient();
  const query = supabase
    .from("assessment_questions")
    .select("id, skill, type, difficulty, passage, passage_title, audio_url, question, options, correct_answer, explanation")
    .eq("approved", true)
    .eq("deprecated", false)
    .eq("skill", skill)
    .eq("difficulty", level);

  const { data } = await query;
  if (!data || data.length === 0) return null;

  // Pick one not already answered
  const available = data.filter((q: { id: string }) => !excludeIds.includes(q.id));
  if (available.length === 0) return null;

  const picked = available[Math.floor(Math.random() * available.length)];
  return {
    id: picked.id,
    skill: picked.skill as AssessmentQuestion["skill"],
    type: picked.type as AssessmentQuestion["type"],
    difficulty: picked.difficulty as CefrLevel,
    passage: picked.passage ?? null,
    passageTitle: picked.passage_title ?? null,
    audioUrl: picked.audio_url ?? null,
    question: picked.question,
    options: Array.isArray(picked.options) ? (picked.options as string[]) : null,
    correctAnswer: picked.correct_answer,
    explanation: picked.explanation ?? null,
    // See fetchQuestionById above: these columns don't exist in the DB.
    sectionInstruction: null,
    questionInstruction: null,
    audioInstruction: null,
  };
}

// ── Reconstruct adaptive state from DB ───────────────────────────────────

async function loadAdaptiveState(
  attemptId: string,
  startingBand: number | null,
  startingCefr: string | null,
): Promise<{ reading: SkillState; listening: SkillState }> {
  const supabase = createServiceClient();

  // Load all responses for this attempt in order
  const { data: responses } = await supabase
    .from("placement_responses")
    .select("question_id, user_answer, is_correct, time_taken_seconds, sequence_number")
    .eq("attempt_id", attemptId)
    .order("sequence_number", { ascending: true });

  // Load the question metadata for each response
  type RawResponse = { question_id: string; user_answer: string; is_correct: boolean; time_taken_seconds: number | null; sequence_number: number };
  const questionIds = (responses ?? [] as RawResponse[]).map((r: RawResponse) => r.question_id);
  let questionMeta: Record<string, { skill: string; difficulty: string }> = {};
  if (questionIds.length > 0) {
    const { data: questions } = await supabase
      .from("assessment_questions")
      .select("id, skill, difficulty")
      .in("id", questionIds);
    for (const q of (questions ?? []) as { id: string; skill: string; difficulty: string }[]) {
      questionMeta[q.id] = { skill: q.skill, difficulty: q.difficulty };
    }
  }

  // Initial ability: derived from the self-reported band/CEFR from onboarding
  const initialAbility = startingBand
    ? bandToAbilityIndex(startingBand)
    : cefrToAbilityIndex(startingCefr as CefrLevel | null);

  const reading: SkillState = { skill: "reading", abilityIndex: initialAbility, responses: [] };
  const listening: SkillState = { skill: "listening", abilityIndex: initialAbility, responses: [] };

  for (const r of (responses ?? []) as RawResponse[]) {
    const meta = questionMeta[r.question_id];
    if (!meta) continue;

    const resp: QuestionResponse = {
      questionId: r.question_id,
      userAnswer: r.user_answer,
      isCorrect: r.is_correct,
      timeTakenSeconds: r.time_taken_seconds ?? null,
      sequenceNumber: r.sequence_number,
      difficulty: meta.difficulty as CefrLevel,
      skill: meta.skill as "reading" | "listening",
    };

    if (meta.skill === "reading") {
      reading.abilityIndex = updateAbility(reading.abilityIndex, meta.difficulty as CefrLevel, r.is_correct);
      reading.responses.push(resp);
    } else {
      listening.abilityIndex = updateAbility(listening.abilityIndex, meta.difficulty as CefrLevel, r.is_correct);
      listening.responses.push(resp);
    }
  }

  return { reading, listening };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Start a new placement attempt.
 * Called once when the learner clicks "Start Assessment".
 */
export async function startAssessment(
  userId: string,
  currentBand: number | null,
  englishLevel: string | null,
): Promise<StartResponse> {
  const supabase = createServiceClient();

  // Create the attempt row
  const { data: attempt, error } = await supabase
    .from("placement_attempts")
    .insert({ user_id: userId, status: "in_progress" })
    .select("id")
    .single();

  if (error || !attempt) throw new Error("Failed to create placement attempt");

  // Select the first question (Reading, at the estimated starting level)
  const startAbility = currentBand
    ? bandToAbilityIndex(currentBand)
    : cefrToAbilityIndex(englishLevel as CefrLevel | null);

  // Start at B1 by default (most common level); adjust if far from it
  const startLevel = startAbility <= 1 ? "A2" : startAbility >= 4 ? "C1" : "B1";

  const firstQuestion = await fetchQuestionForSlot("reading", startLevel as CefrLevel, []);
  if (!firstQuestion) throw new Error("No approved questions available");

  return {
    attemptId: attempt.id,
    firstQuestion,
    estimatedTotal: ESTIMATED_TOTAL_QUESTIONS,
  };
}

/**
 * Record an answer and return the next question (or signal completion).
 * Reconstructs full adaptive state from DB on each call — stateless and crash-safe.
 */
export async function recordAnswer(input: {
  attemptId: string;
  questionId: string;
  userAnswer: string;
  timeTakenSeconds: number | null;
  currentBand: number | null;
  englishLevel: string | null;
}): Promise<AnswerResponse> {
  const supabase = createServiceClient();

  // Verify attempt exists and is still in progress
  const { data: attempt } = await supabase
    .from("placement_attempts")
    .select("id, status, user_id")
    .eq("id", input.attemptId)
    .single();

  if (!attempt || attempt.status !== "in_progress") {
    throw new Error("Attempt not found or already completed");
  }

  // Fetch the question to check the answer
  const question = await fetchQuestionById(input.questionId);
  if (!question) throw new Error("Question not found");

  const isCorrect =
    input.userAnswer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();

  // Count current responses to get sequence number
  const { count } = await supabase
    .from("placement_responses")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", input.attemptId);

  const sequenceNumber = (count ?? 0) + 1;

  // Record the response
  await supabase.from("placement_responses").insert({
    attempt_id: input.attemptId,
    question_id: input.questionId,
    user_answer: input.userAnswer,
    is_correct: isCorrect,
    time_taken_seconds: input.timeTakenSeconds,
    sequence_number: sequenceNumber,
  });

  // Reconstruct adaptive state (now includes the response just inserted)
  const { reading, listening } = await loadAdaptiveState(
    input.attemptId,
    input.currentBand,
    input.englishLevel,
  );

  const totalAnswered = reading.responses.length + listening.responses.length;

  // Check if session is complete
  if (isSessionComplete(reading, listening)) {
    const result = computePlacementResult(input.attemptId, reading, listening);
    return { done: true, result };
  }

  // Select next question
  const pool = await loadQuestionPool();
  const answeredIds = new Set([...reading.responses, ...listening.responses].map((r) => r.questionId));

  const next = selectNext(reading, listening, pool, answeredIds);
  if (!next) {
    // No more questions available — force completion
    const result = computePlacementResult(input.attemptId, reading, listening);
    return { done: true, result };
  }

  const nextQuestion = await fetchQuestionForSlot(next.skill, next.targetLevel, [...answeredIds]);
  if (!nextQuestion) {
    const result = computePlacementResult(input.attemptId, reading, listening);
    return { done: true, result };
  }

  return {
    done: false,
    nextQuestion,
    questionsAnswered: totalAnswered,
    estimatedTotal: ESTIMATED_TOTAL_QUESTIONS,
  };
}

/**
 * Finalise the attempt: persist results, update profile, mark placement_completed.
 * Called by the /complete route after the client receives done:true.
 */
export async function finaliseAssessment(input: {
  attemptId: string;
  userId: string;
  currentBand: number | null;
  englishLevel: string | null;
}): Promise<void> {
  const supabase = createServiceClient();

  const { reading, listening } = await loadAdaptiveState(
    input.attemptId,
    input.currentBand,
    input.englishLevel,
  );

  const result = computePlacementResult(input.attemptId, reading, listening);

  // Persist result to placement_attempts
  await supabase.from("placement_attempts").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    overall_cefr_level: result.overallCefrLevel,
    reading_cefr_level: result.readingLevel,
    listening_cefr_level: result.listeningLevel,
    estimated_band: result.estimatedBand,
    confidence_score: result.confidenceScore,
    weak_areas: result.weakAreas,
    raw_scores: result.rawScores,
    adaptive_path: [...reading.responses, ...listening.responses].map((r) => ({
      questionId: r.questionId,
      skill: r.skill,
      difficulty: r.difficulty,
      correct: r.isCorrect,
    })),
  }).eq("id", input.attemptId);

  // Update profile with assessed levels (never overwrites self-reported current_band)
  await supabase.from("profiles").update({
    assessed_cefr_level: result.overallCefrLevel,
    assessed_band: result.estimatedBand,
    assessed_reading_level: result.readingLevel,
    assessed_listening_level: result.listeningLevel,
    weak_areas: result.weakAreas,
    assessment_confidence: result.confidenceScore,
    placement_completed: true,
  }).eq("user_id", input.userId);
}
