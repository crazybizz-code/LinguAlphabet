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
  const questionMeta: Record<string, { skill: string; difficulty: string }> = {};
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

// ── Client-safe question shaping ──────────────────────────────────────────

/**
 * Strip the correct answer and explanation before a question is sent to the
 * client. The server retains and uses the real values internally for
 * grading (fetchQuestionById, computePlacementResult) — only the payload
 * handed back to the learner is redacted. Mirrors the same pattern already
 * used by src/lib/practice/engine.ts's startPracticeSession, including its
 * listening rule: while real audio can be played the transcript is answer-
 * bearing and never leaves the server; without audio it is the only content
 * that exists and passes through as a reading stand-in.
 */
export function stripAnswer(question: AssessmentQuestion): AssessmentQuestion {
  const hidesTranscript = question.skill === "listening" && question.audioUrl !== null;
  return {
    ...question,
    correctAnswer: "",
    explanation: null,
    passage: hidesTranscript ? null : question.passage,
    passageTitle: hidesTranscript ? null : question.passageTitle,
  };
}

// ── Flow errors ────────────────────────────────────────────────────────────

/** An expected, learner-safe rejection; `status` is the HTTP status the route returns. */
export class PlacementFlowError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "PlacementFlowError";
  }
}

// ── Next-step resolution ──────────────────────────────────────────────────

type NextStep = { done: true } | { done: false; question: AssessmentQuestion };

/**
 * The single definition of "what comes next" for an attempt — used both
 * when recording an answer and when finalising, so /complete can verify
 * the session genuinely reached its end instead of trusting the client's
 * word that it did.
 */
async function resolveNextStep(reading: SkillState, listening: SkillState): Promise<NextStep> {
  if (isSessionComplete(reading, listening)) return { done: true };

  const pool = await loadQuestionPool();
  const answeredIds = new Set([...reading.responses, ...listening.responses].map((r) => r.questionId));

  const next = selectNext(reading, listening, pool, answeredIds);
  if (!next) return { done: true };

  const question = await fetchQuestionForSlot(next.skill, next.targetLevel, [...answeredIds]);
  return question ? { done: false, question } : { done: true };
}

interface AttemptRow {
  id: string;
  user_id: string;
  status: string;
  pending_question_id: string | null;
}

async function loadOwnedAttempt(attemptId: string, userId: string): Promise<AttemptRow> {
  const supabase = createServiceClient();
  const { data: attempt } = await supabase
    .from("placement_attempts")
    .select("id, user_id, status, pending_question_id")
    .eq("id", attemptId)
    .maybeSingle();

  // Same response for "doesn't exist" and "isn't yours" — never confirm
  // that another learner's attempt id is real.
  if (!attempt || attempt.user_id !== userId) throw new PlacementFlowError("Attempt not found", 404);
  return attempt as AttemptRow;
}

/** Serves `question` as the attempt's pending question, only if nothing else claimed the slot first. */
async function setPendingQuestion(attemptId: string, questionId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("placement_attempts")
    .update({ pending_question_id: questionId })
    .eq("id", attemptId)
    .eq("status", "in_progress")
    .is("pending_question_id", null)
    .select("id");
  if (error) throw new Error(`Failed to serve next question: ${error.message}`);
  if (!data || data.length === 0) throw new PlacementFlowError("This answer was already recorded", 409);
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

  // Select the first question (Reading, at the estimated starting level)
  const startAbility = currentBand
    ? bandToAbilityIndex(currentBand)
    : cefrToAbilityIndex(englishLevel as CefrLevel | null);

  // Start at B1 by default (most common level); adjust if far from it
  const startLevel = startAbility <= 1 ? "A2" : startAbility >= 4 ? "C1" : "B1";

  const firstQuestion = await fetchQuestionForSlot("reading", startLevel as CefrLevel, []);
  if (!firstQuestion) throw new Error("No approved questions available");

  // The attempt is created already bound to the question it serves, so the
  // first /answer can be verified exactly like every later one.
  const { data: attempt, error } = await supabase
    .from("placement_attempts")
    .insert({ user_id: userId, status: "in_progress", pending_question_id: firstQuestion.id })
    .select("id")
    .single();

  if (error || !attempt) throw new Error("Failed to create placement attempt");

  return {
    attemptId: attempt.id,
    firstQuestion: stripAnswer(firstQuestion),
    estimatedTotal: ESTIMATED_TOTAL_QUESTIONS,
  };
}

/**
 * Where the attempt stands right now, without recording anything. Serves a
 * client retrying an answer the server already recorded (the response was
 * lost in transit), and self-heals the rare crash between recording an
 * answer and serving the next question.
 */
async function currentStep(attempt: AttemptRow, currentBand: number | null, englishLevel: string | null): Promise<AnswerResponse> {
  const { reading, listening } = await loadAdaptiveState(attempt.id, currentBand, englishLevel);
  const questionsAnswered = reading.responses.length + listening.responses.length;

  if (attempt.pending_question_id) {
    const pending = await fetchQuestionById(attempt.pending_question_id);
    if (!pending) throw new Error("Question not found");
    return { done: false, nextQuestion: stripAnswer(pending), questionsAnswered, estimatedTotal: ESTIMATED_TOTAL_QUESTIONS };
  }

  const step = await resolveNextStep(reading, listening);
  if (step.done) return { done: true, result: computePlacementResult(attempt.id, reading, listening) };

  await setPendingQuestion(attempt.id, step.question.id);
  return { done: false, nextQuestion: stripAnswer(step.question), questionsAnswered, estimatedTotal: ESTIMATED_TOTAL_QUESTIONS };
}

/**
 * Record an answer and return the next question (or signal completion).
 * Reconstructs full adaptive state from DB on each call — stateless and crash-safe.
 *
 * Security (pentest V-02): the answer is accepted only if the attempt
 * belongs to the caller, is still in progress, and `questionId` is the
 * question the server itself served (`pending_question_id`). Without that
 * binding a learner could answer questions of their own choosing — e.g.
 * hard ones whose answers they saw in Practice review — and steer their
 * band. The pending slot is claimed with a conditional update, so two
 * concurrent submissions for the same question cannot both be recorded.
 */
export async function recordAnswer(input: {
  attemptId: string;
  userId: string;
  questionId: string;
  userAnswer: string;
  timeTakenSeconds: number | null;
  currentBand: number | null;
  englishLevel: string | null;
}): Promise<AnswerResponse> {
  const supabase = createServiceClient();

  const attempt = await loadOwnedAttempt(input.attemptId, input.userId);
  if (attempt.status !== "in_progress") throw new PlacementFlowError("Attempt already completed", 409);

  if (attempt.pending_question_id !== input.questionId) {
    const { data: existing } = await supabase
      .from("placement_responses")
      .select("id")
      .eq("attempt_id", input.attemptId)
      .eq("question_id", input.questionId)
      .limit(1);
    if (existing && existing.length > 0) {
      return currentStep(attempt, input.currentBand, input.englishLevel);
    }
    throw new PlacementFlowError("This question is not the current question for this attempt", 409);
  }

  // Claim the pending question atomically before grading.
  const { data: claimed, error: claimError } = await supabase
    .from("placement_attempts")
    .update({ pending_question_id: null })
    .eq("id", input.attemptId)
    .eq("status", "in_progress")
    .eq("pending_question_id", input.questionId)
    .select("id");
  if (claimError) throw new Error(`Failed to record answer: ${claimError.message}`);
  if (!claimed || claimed.length === 0) throw new PlacementFlowError("This answer was already recorded", 409);

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

  const { error: insertError } = await supabase.from("placement_responses").insert({
    attempt_id: input.attemptId,
    question_id: input.questionId,
    user_answer: input.userAnswer,
    is_correct: isCorrect,
    time_taken_seconds: input.timeTakenSeconds,
    sequence_number: sequenceNumber,
  });
  if (insertError) {
    // Put the question back so the learner's retry can succeed.
    await supabase
      .from("placement_attempts")
      .update({ pending_question_id: input.questionId })
      .eq("id", input.attemptId)
      .is("pending_question_id", null);
    throw new Error(`Failed to record answer: ${insertError.message}`);
  }

  // Reconstruct adaptive state (now includes the response just inserted)
  const { reading, listening } = await loadAdaptiveState(
    input.attemptId,
    input.currentBand,
    input.englishLevel,
  );

  const step = await resolveNextStep(reading, listening);
  if (step.done) {
    const result = computePlacementResult(input.attemptId, reading, listening);
    return { done: true, result };
  }

  await setPendingQuestion(input.attemptId, step.question.id);

  return {
    done: false,
    nextQuestion: stripAnswer(step.question),
    questionsAnswered: reading.responses.length + listening.responses.length,
    estimatedTotal: ESTIMATED_TOTAL_QUESTIONS,
  };
}

/**
 * Finalise the attempt: persist results, update profile, mark placement_completed.
 * Called by the /complete route after the client receives done:true.
 *
 * Security (pentest V-02): the result is computed here from the server's
 * own recorded responses — the client sends nothing but the attempt id —
 * and only once the server's own next-step logic agrees the session is
 * over. The terminal write goes through finalize_placement_attempt(), a
 * service_role-only function that updates the attempt and the profile in
 * one transaction and only while the attempt is still in progress.
 *
 * Returns `alreadyCompleted: true` (and writes nothing) when the attempt
 * was finalised by an earlier call, so a retried /complete is harmless.
 */
export async function finaliseAssessment(input: {
  attemptId: string;
  userId: string;
  currentBand: number | null;
  englishLevel: string | null;
}): Promise<{ alreadyCompleted: boolean }> {
  const supabase = createServiceClient();

  const attempt = await loadOwnedAttempt(input.attemptId, input.userId);
  if (attempt.status === "completed") return { alreadyCompleted: true };
  if (attempt.status !== "in_progress") throw new PlacementFlowError("Attempt is not active", 409);

  const { reading, listening } = await loadAdaptiveState(
    input.attemptId,
    input.currentBand,
    input.englishLevel,
  );

  if (attempt.pending_question_id !== null || !(await resolveNextStep(reading, listening)).done) {
    throw new PlacementFlowError("Assessment is not finished yet", 409);
  }

  const result = computePlacementResult(input.attemptId, reading, listening);

  const { data: finalised, error } = await supabase.rpc("finalize_placement_attempt", {
    p_attempt_id: input.attemptId,
    p_user_id: input.userId,
    p_result: {
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
    },
  });
  if (error) throw new Error(`Failed to finalise placement attempt: ${error.message}`);

  // false = a concurrent /complete finalised it between our read and write.
  return { alreadyCompleted: finalised !== true };
}
