import type { LearningSignal } from "@/ai/data";
import type { LearnerState, TopicMasteryRecord, LearnerMomentum, LearnerStateOpenQuestion, MasteryStatus } from "./types";

/** How many recent topics to surface — a summary, not a full history dump. */
const RECENT_TOPIC_LIMIT = 5;

/** Same-word lookups within evidence this recent count as "struggling," not just "curious." */
const VOCABULARY_STRUGGLE_VIEW_THRESHOLD = 3;

/** Consecutive correct quiz answers on one topic (most-recent-first, no incorrect since) to call it mastered. */
const GRAMMAR_MASTERY_STREAK = 3;
/** Incorrect quiz answers on one topic, with no later correct answer, to flag it weak. */
const GRAMMAR_WEAK_THRESHOLD = 2;

/** Evidence count at which the "amount of evidence" component of confidence saturates. */
const CONFIDENCE_EVIDENCE_TARGET = 3;
/** Evidence older than this contributes minimally to confidence — never zero, a real conclusion doesn't vanish overnight, just discounts. */
const CONFIDENCE_RECENCY_WINDOW_DAYS = 60;

/** A topic with real prior evidence this stale is a review candidate — spaced-repetition-style staleness, not the same thing as "weak" (which means the evidence itself was negative). */
const REVIEW_STALENESS_DAYS = 14;

/** Completion signals within this window feed momentum. */
const MOMENTUM_WINDOW_DAYS = 14;

function daysBetween(earlier: Date, later: Date): number {
  return Math.max(0, (later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

function groupByTopic(signals: LearningSignal[]): Map<string, LearningSignal[]> {
  const groups = new Map<string, LearningSignal[]>();
  for (const signal of signals) {
    if (!signal.topic) continue;
    const existing = groups.get(signal.topic);
    if (existing) existing.push(signal);
    else groups.set(signal.topic, [signal]);
  }
  return groups;
}

/**
 * Deterministic evidence-strength score, not a probabilistic AI
 * estimate — see TopicMasteryRecord.confidence's doc comment for why
 * that distinction matters even though both use a 0-1 scale.
 */
function computeConfidence(evidenceCount: number, lastEvidenceAt: Date, now: Date): number {
  const evidenceStrength = Math.min(1, evidenceCount / CONFIDENCE_EVIDENCE_TARGET);
  const recencyFactor = Math.max(0, 1 - daysBetween(lastEvidenceAt, now) / CONFIDENCE_RECENCY_WINDOW_DAYS);
  return Math.round(evidenceStrength * (0.5 + 0.5 * recencyFactor) * 100) / 100;
}

/**
 * vocabulary_viewed/vocabulary_saved only ever prove "the learner looked
 * at this word" or "the learner asked to keep it" — neither proves it
 * stuck. Repeated lookups (VOCABULARY_STRUGGLE_VIEW_THRESHOLD+) are real,
 * direct evidence of struggle. Everything else that has any evidence at
 * all is "emerging," deliberately never "mastered": today's evidence
 * can't distinguish "the learner mastered this word" from "the learner
 * saw it once and moved on for an unrelated reason" — see
 * computeOpenQuestions() below, this is flagged there explicitly rather
 * than guessed here.
 */
function computeVocabularyMastery(signals: LearningSignal[], now: Date): TopicMasteryRecord[] {
  const relevant = signals.filter((signal) => signal.type === "vocabulary_viewed" || signal.type === "vocabulary_saved");
  const byWord = groupByTopic(relevant);

  const records: TopicMasteryRecord[] = [];
  for (const [word, evidence] of byWord) {
    const viewCount = evidence.filter((signal) => signal.type === "vocabulary_viewed").length;
    const lastEvidenceAt = new Date(evidence[0].createdAt); // evidence is already sorted most-recent-first (see computeLearnerState)

    const status: MasteryStatus = viewCount >= VOCABULARY_STRUGGLE_VIEW_THRESHOLD ? "weak" : "emerging";

    records.push({
      topic: word,
      skill: "vocabulary",
      status,
      confidence: computeConfidence(evidence.length, lastEvidenceAt, now),
      evidenceCount: evidence.length,
      lastEvidenceAt: lastEvidenceAt.toISOString(),
    });
  }
  return records;
}

/**
 * Reads quiz_answer_recorded — per-question, topic-tagged quiz evidence
 * (docs/learning-signal-specification.md's Tier 1 proposal). Nothing
 * emits this signal yet (QuizStep only reports an aggregate score
 * today), so this deterministically returns [] in production right now
 * — the correct, honest result of an aggregation with no matching
 * evidence, not a bug. The logic itself is written and ready for the
 * moment that evidence starts flowing.
 */
function computeGrammarMastery(signals: LearningSignal[], now: Date): TopicMasteryRecord[] {
  const answers = signals.filter((signal) => signal.type === "quiz_answer_recorded");
  const byTopic = groupByTopic(answers);

  const records: TopicMasteryRecord[] = [];
  for (const [topic, topicAnswers] of byTopic) {
    // topicAnswers is already sorted most-recent-first (inherited from computeLearnerState's sort).
    let consecutiveCorrect = 0;
    for (const answer of topicAnswers) {
      if ((answer.evidence as { correct?: unknown }).correct === true) consecutiveCorrect += 1;
      else break;
    }
    const incorrectCount = topicAnswers.filter((answer) => (answer.evidence as { correct?: unknown }).correct === false).length;

    let status: MasteryStatus;
    if (consecutiveCorrect >= GRAMMAR_MASTERY_STREAK) status = "mastered";
    else if (consecutiveCorrect === 0 && incorrectCount >= GRAMMAR_WEAK_THRESHOLD) status = "weak";
    else status = "developing";

    const lastEvidenceAt = new Date(topicAnswers[0].createdAt);
    records.push({
      topic,
      skill: "grammar",
      status,
      confidence: computeConfidence(topicAnswers.length, lastEvidenceAt, now),
      evidenceCount: topicAnswers.length,
      lastEvidenceAt: lastEvidenceAt.toISOString(),
    });
  }
  return records;
}

/** Raw Tier 1 evidence of engagement, not a mastery judgment — what topics the learner has actually touched recently. */
function computeRecentlyStudiedTopics(signals: LearningSignal[]): string[] {
  const relevant = signals.filter((signal) => (signal.type === "explanation_requested" || signal.type === "vocabulary_viewed") && signal.topic);
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const signal of relevant) {
    if (!signal.topic || seen.has(signal.topic)) continue;
    seen.add(signal.topic);
    topics.push(signal.topic);
    if (topics.length >= RECENT_TOPIC_LIMIT) break;
  }
  return topics;
}

/**
 * Spaced-repetition-style forgetting risk: real prior evidence that's
 * gone stale. Deliberately excludes "weak" topics — those already need
 * reinforcement for a different reason (the evidence itself was
 * negative), not because time has passed; conflating the two queues
 * would blur why a topic showed up.
 */
function computeReviewCandidates(topicMastery: TopicMasteryRecord[], now: Date): TopicMasteryRecord[] {
  return topicMastery.filter((record) => record.status !== "weak" && daysBetween(new Date(record.lastEvidenceAt), now) >= REVIEW_STALENESS_DAYS);
}

/** Deterministic, explainable trend: more completions in the recent half of the window than the earlier half. */
function computeMomentum(signals: LearningSignal[], now: Date): LearnerMomentum {
  const completionTypes = new Set(["article_completed", "podcast_completed", "quiz_completed"]);
  const windowStart = new Date(now.getTime() - MOMENTUM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recent = signals.filter((signal) => completionTypes.has(signal.type) && new Date(signal.createdAt) >= windowStart);

  if (recent.length < 2) {
    return { recentSessionCount: recent.length, trend: "insufficient-data" };
  }

  const midpoint = new Date(now.getTime() - (MOMENTUM_WINDOW_DAYS / 2) * 24 * 60 * 60 * 1000);
  const earlierHalf = recent.filter((signal) => new Date(signal.createdAt) < midpoint).length;
  const laterHalf = recent.length - earlierHalf;

  const trend: LearnerMomentum["trend"] = laterHalf > earlierHalf ? "increasing" : laterHalf < earlierHalf ? "decreasing" : "steady";
  return { recentSessionCount: recent.length, trend };
}

/**
 * The structured form of "stop and explicitly identify it as a future AI
 * reasoning responsibility instead of mixing the two" — every place this
 * engine's deterministic logic can't reach a conclusion, and why, so a
 * consumer never mistakes "empty" for "nothing to say" when the honest
 * answer is "no way to know yet."
 */
function computeOpenQuestions(signals: LearningSignal[]): LearnerStateOpenQuestion[] {
  const questions: LearnerStateOpenQuestion[] = [];

  const hasQuizAnswerEvidence = signals.some((signal) => signal.type === "quiz_answer_recorded");
  if (!hasQuizAnswerEvidence) {
    questions.push({
      topic: null,
      question: "Which grammar topics has the learner mastered, and which need reinforcement?",
      reason:
        "No quiz_answer_recorded signals exist yet — QuizStep only reports an aggregate score today (quiz_completed), not a per-question, topic-tagged result. The deterministic derivation is fully specified and implemented (see computeGrammarMastery); it has no evidence to run on. This is a data-instrumentation gap, not a deterministic-reasoning gap.",
    });
  }

  questions.push({
    topic: null,
    question: "Which vocabulary is fully mastered, not just emerging?",
    reason:
      "vocabulary_viewed/vocabulary_saved alone can't distinguish 'the learner mastered this word' from 'the learner saw it once and never revisited it for an unrelated reason' — that needs either quiz evidence tagged to the word, or a measure of how often the word actually appeared in content the learner engaged with (neither exists today). This is a genuine future AI-reasoning candidate, not a deterministic one: Tuto could plausibly judge mastery from a learner using a word correctly and unprompted in conversation, which no amount of view/save counting can substitute for.",
  });

  return questions;
}

/**
 * Signals → Learner State (Phase 4A). Pure and deterministic: same
 * signals in, same LearnerState out, no I/O, no model call inside this
 * function. Fetching signals is SignalRepository's job
 * (src/ai/data/signal-repository.ts); reasoning about them is this
 * function's job — kept separate so the reasoning is unit-testable
 * without a database, and so "where does the data come from" can change
 * without this logic changing at all.
 *
 * Nothing this function produces is persisted
 * (docs/learning-signal-specification.md's Tier 2 rule: never store a
 * conclusion you can always re-derive) — every call recomputes fresh
 * from Tier 1 evidence. LearnerRepository
 * (src/ai/data/learner-repository.ts) is the one caller today, projecting
 * the result into the thinner LearnerProfile shape the prompt already
 * consumes — the LLM never reads raw signals or calls this function
 * directly.
 */
export function computeLearnerState(learnerId: string, rawSignals: LearningSignal[]): LearnerState {
  const now = new Date();
  const signals = [...rawSignals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const grammarMastery = computeGrammarMastery(signals, now);
  const vocabularyMastery = computeVocabularyMastery(signals, now);
  const topicMastery = [...grammarMastery, ...vocabularyMastery];

  return {
    learnerId,
    computedAt: now.toISOString(),
    topicMastery,
    grammarMastery,
    vocabularyMastery,
    recentlyStudiedTopics: computeRecentlyStudiedTopics(signals),
    reviewCandidates: computeReviewCandidates(topicMastery, now),
    momentum: computeMomentum(signals, now),
    openQuestions: computeOpenQuestions(signals),
  };
}
