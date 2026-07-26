import type { SignalSkill } from "@/ai/data";

/**
 * "emerging"/"weak" cover today's real evidence (vocabulary
 * viewed/saved repetition patterns); "mastered" is reachable once
 * quiz_answer_recorded evidence exists (grammar) — see engine.ts's
 * computeVocabularyMastery() doc comment for why vocabulary can't
 * deterministically reach "mastered" from today's evidence alone.
 * "developing" is the honest middle state: some evidence, not enough
 * either direction yet.
 */
export const MASTERY_STATUSES = ["weak", "emerging", "developing", "mastered"] as const;
export type MasteryStatus = (typeof MASTERY_STATUSES)[number];

/**
 * One topic's mastery conclusion — the extensible unit every Learner
 * State list is built from. Adding a new skill (e.g. pronunciation, once
 * real evidence exists for it) never requires a new top-level
 * LearnerState field or a schema change, just more records with a
 * different `skill`.
 */
export interface TopicMasteryRecord {
  topic: string;
  skill: SignalSkill;
  status: MasteryStatus;
  /**
   * Deterministic evidence-strength score (0-1) — how much and how
   * recent the evidence is, NOT a probabilistic AI estimate. Uses the
   * same 0-1 scale as Tier 3's `confidence` for consistency, but means
   * something categorically different: this is arithmetic over a known
   * evidence count, that's the model's own self-reported certainty. See
   * engine.ts's computeConfidence().
   */
  confidence: number;
  evidenceCount: number;
  /** ISO timestamp of the most recent contributing signal. */
  lastEvidenceAt: string;
}

export interface LearnerMomentum {
  /** Completion signals (article/podcast/quiz) within the engine's momentum window — see engine.ts's MOMENTUM_WINDOW_DAYS. */
  recentSessionCount: number;
  trend: "increasing" | "steady" | "decreasing" | "insufficient-data";
}

/**
 * A place deterministic logic could not reach a conclusion, and why —
 * the structured form of "stop and explicitly identify it as a future AI
 * reasoning responsibility instead of mixing the two." Never silently
 * empty when the real reason is "no way to know yet" — see engine.ts's
 * computeOpenQuestions().
 */
export interface LearnerStateOpenQuestion {
  topic: string | null;
  question: string;
  reason: string;
}

/**
 * The Learning Engine's output (Phase 4A) — a structured snapshot of
 * what can be concluded about a learner from their signal history. The
 * LLM never reads raw signals directly; it reads this (via
 * LearnerRepository's thinner LearnerProfile projection, or this
 * directly for a future consumer that needs the full picture — a Coach
 * Planner, a debug view).
 *
 * `topicMastery` is the extensible backbone every other list is a
 * filtered view over — this is what "additional fields can be added
 * later without changing the architecture" means concretely: a new skill
 * is more records in this one array, not a new top-level field.
 * `grammarMastery`/`vocabularyMastery` exist as named fields anyway,
 * because that's the shape a consumer (a prompt block, a future
 * dashboard) actually wants to read without re-filtering every time.
 */
export interface LearnerState {
  learnerId: string;
  /** LearnerState is a snapshot, not a live value — always recomputed, never itself persisted (see engine.ts's doc comment on why). */
  computedAt: string;

  topicMastery: TopicMasteryRecord[];
  grammarMastery: TopicMasteryRecord[];
  vocabularyMastery: TopicMasteryRecord[];

  /** Raw Tier 1 evidence, not a mastery judgment — what the learner has actually engaged with recently. */
  recentlyStudiedTopics: string[];
  /** Topics with real prior evidence whose evidence has gone stale — spaced-repetition-style forgetting risk, not a content recommendation (that's a future, separate Recommendation System). */
  reviewCandidates: TopicMasteryRecord[];

  momentum: LearnerMomentum;

  openQuestions: LearnerStateOpenQuestion[];
}
