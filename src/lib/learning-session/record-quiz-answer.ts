"use server";

import { createClient } from "@/lib/supabase/server";
import { createSignalRepository } from "@/ai/data";
import type { QuizAnswerEvidence } from "@/ai/data";
import type { QuizQuestion } from "@/types/content";

export interface RecordQuizAnswerParams {
  /** Equal to contentId today — a quiz isn't its own entity, see QuizAnswerEvidence's doc comment (src/ai/data/signal-repository.ts). */
  quizId: string;
  contentId: string;
  contentType: "article" | "podcast";
  question: QuizQuestion;
  questionIndex: number;
  chosenOptionIndex: number;
}

/**
 * The one write path for "a learner answered a quiz question" — Phase 5's
 * core evidence emission (docs/learning-signal-specification.md). One
 * answered question produces exactly one quiz_answer_recorded Tier 1
 * signal: raw, structured evidence only. This function never emits
 * grammar_mistake, grammar_mastered, or any other conclusion — that's
 * src/ai/learning-engine's job, computed on read from the evidence
 * written here, never asserted at write time.
 *
 * Best-effort by design (never throws) — a signal-write failure must
 * never disrupt the learner's actual quiz-taking experience, same rule
 * every other Phase 3+ emitter follows (see completeMission,
 * saveVocabularyWord).
 */
export async function recordQuizAnswer(params: RecordQuizAnswerParams): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { question, questionIndex, chosenOptionIndex } = params;
  const questionId = question.id ?? `${params.contentId}:${questionIndex}`;
  const grammarTopic = question.grammarTopic ?? null;
  const vocabularyWord = question.vocabularyWord ?? null;
  const correct = chosenOptionIndex === question.correct;

  const evidence: QuizAnswerEvidence = {
    questionId,
    quizId: params.quizId,
    learnerId: user.id,
    contentId: params.contentId,
    grammarTopic,
    vocabularyWord,
    correct,
    chosenAnswer: question.options[chosenOptionIndex] ?? "",
    correctAnswer: question.options[question.correct] ?? "",
    timestamp: new Date().toISOString(),
  };

  try {
    await createSignalRepository(supabase, user.id).record({
      type: "quiz_answer_recorded",
      // Grouped/derived on read by src/ai/learning-engine's computeGrammarMastery — grammarTopic takes priority since that's what today's grammar-mastery derivation actually reads.
      topic: grammarTopic ?? vocabularyWord,
      skill: grammarTopic ? "grammar" : vocabularyWord ? "vocabulary" : params.contentType === "podcast" ? "listening" : "reading",
      evidence: evidence as unknown as Record<string, unknown>,
      source: "content_session",
      confidence: null,
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}
