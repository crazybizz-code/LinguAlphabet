import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";

export const SIGNAL_TYPES = [
  // Tier 1 — Objective. Real evidence exists today, no model judgment
  // involved. Emitted since Phase 3.
  "article_completed",
  "podcast_completed",
  "quiz_completed",
  "vocabulary_viewed",
  "vocabulary_saved",
  "explanation_requested",
  // Tier 1 — reserved, not yet emitted anywhere. No real, non-fabricated
  // evidence source exists for these today. hint_requested has no UI
  // concept of a "hint" distinct from a lookup/explanation yet;
  // reading_time/listening_time have no real elapsed-time measurement
  // reaching the server (completeMission only ever receives the content's
  // static estimated duration, not time actually spent). Faking one now
  // from a proxy would be the exact "store a conclusion instead of
  // deriving it from evidence" mistake this model exists to avoid.
  "hint_requested",
  "reading_time",
  "listening_time",
  // Tier 1 — reserved, proposed in docs/learning-signal-specification.md.
  // Per-question, topic-tagged quiz evidence — the foundation Tier 2's
  // grammar_mistake/grammar_mastered derivations read from. Not emitted
  // yet: QuizStep only reports an aggregate score today (quiz_completed),
  // not a result per question. Wiring this requires touching QuizStep.tsx
  // and needs its own sign-off, same as every other screen change in this
  // project.
  "quiz_answer_recorded",
  // Tier 2 — Derived Facts (docs/learning-signal-specification.md,
  // approved). Computed deterministically from Tier 1 evidence
  // (quiz_answer_recorded / vocabulary_viewed / vocabulary_saved) by
  // src/ai/learning-engine — never stored as a row of their own, since a
  // Tier 2 fact is by definition always re-derivable. These four names
  // stay in this union only so LearningSignal's shape can represent one
  // in memory (src/ai/learning-engine/types.ts's TopicMasteryRecord),
  // never because SignalRepository.record() should ever be called with
  // one — see the doc comment on SignalRepository below.
  "grammar_mistake",
  "grammar_mastered",
  "vocabulary_mastered",
  "vocabulary_struggled",
  // Tier 3 — AI Hypotheses. The only genuinely judgment-based signals in
  // this taxonomy: there is no structured ground truth for confidence
  // the way there is for grammar (a quiz) — detecting it requires
  // reading a learner's own words. Reserved for a later phase, not
  // emitted yet. Whatever emits one of these MUST set `confidence` to a
  // real 0-1 estimate, never null, and `evidence` must carry a verbatim
  // excerpt plus a conversationId for traceability — see
  // docs/learning-signal-specification.md.
  "confidence_drop",
  "confidence_gain",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export type SignalSkill = "grammar" | "vocabulary" | "listening" | "reading" | "speaking" | "writing";
export type SignalSource = "content_session" | "vocabulary_lookup" | "chat";

/**
 * The structured shape every quiz_answer_recorded signal's `evidence`
 * field follows (Phase 5 — docs/learning-signal-specification.md).
 * Documented as a type even though `evidence` itself stays a loose
 * `Record<string, unknown>` at the LearningSignal level, so every reader
 * (src/lib/learning-session/record-quiz-answer.ts writing it,
 * src/ai/learning-engine/engine.ts's computeGrammarMastery reading it)
 * can cast to something concrete instead of guessing field names.
 *
 * `learnerId` and `timestamp` are deliberately redundant with the row's
 * own `user_id` column and `created_at` timestamp — not an oversight.
 * Evidence should be self-describing on its own if it's ever inspected
 * or exported outside the row it lives in; a mismatch between the two
 * would itself be a signal something went wrong. `quizId` equals
 * `contentId` under today's data model (a quiz isn't its own entity —
 * docs/domain-model.md's "universal enrichment attachments" — it's an
 * attachment on the article/podcast content item), kept as a separate
 * field for fidelity to the spec and in case that ever changes.
 */
export interface QuizAnswerEvidence {
  questionId: string;
  quizId: string;
  learnerId: string;
  contentId: string;
  grammarTopic: string | null;
  vocabularyWord: string | null;
  correct: boolean;
  chosenAnswer: string;
  correctAnswer: string;
  timestamp: string;
}

export interface LearningSignal {
  type: SignalType;
  topic: string | null;
  skill: SignalSkill | null;
  /** Structured, objective grounding — never just a bare conclusion. Shape varies by signal type; see each emission site for what it records. */
  evidence: Record<string, unknown>;
  source: SignalSource;
  /**
   * Only meaningful for Tier 3 (AI Hypothesis) signals. Every Tier 1
   * signal this phase emits is mechanical/objective and records `null`
   * here deliberately — it isn't a probability estimate, it's a fact
   * that either happened or didn't. A future Tier 3 emitter
   * (confidence_drop/confidence_gain) must supply a real 0-1 value here,
   * per the project's own rule: no AI-generated signal exists without
   * confidence, evidence, and traceability.
   */
  confidence: number | null;
  /** When this signal was recorded — required for every recency/momentum/decay computation in src/ai/learning-engine. Set by the database default on insert; always present on anything read back via listRecent(). */
  createdAt: string;
}

export interface ListRecentSignalsOptions {
  types?: SignalType[];
  since?: Date;
  limit?: number;
}

/**
 * Repositories store signals, not conclusions. This is the append-only
 * Tier 1 evidence log every objective interaction writes to — the only
 * tier ever written here (Tier 2 is computed, never stored; Tier 3
 * doesn't exist yet, and when it does its writes still land in this same
 * table/interface, just with confidence/evidence held to a stricter bar
 * — see docs/learning-signal-specification.md). No update() or delete()
 * method exists here on purpose, and the backing table
 * (supabase/learning-signals-schema.sql) grants only INSERT/SELECT — the
 * same "Progress is mutable state, Completion is an immutable event"
 * split docs/domain-model.md §15 already established for engagement,
 * applied here to teaching signals: a correction is a new signal, never
 * an edit to an old one.
 *
 * LearnerRepository (src/ai/data/learner-repository.ts) and
 * src/ai/learning-engine both read from here via listRecent() —
 * LearnerRepository to compute a LearnerState, the Learning Engine
 * itself being where that computation actually lives.
 */
export interface SignalRepository {
  /** `createdAt` is set by the database default (`now()`) — a caller never supplies it. */
  record(signal: Omit<LearningSignal, "createdAt">): Promise<void>;
  listRecent(options?: ListRecentSignalsOptions): Promise<LearningSignal[]>;
}

class SupabaseSignalRepository implements SignalRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async record(signal: Omit<LearningSignal, "createdAt">): Promise<void> {
    await this.supabase.from("learning_signals").insert({
      user_id: this.userId,
      type: signal.type,
      topic: signal.topic,
      skill: signal.skill,
      evidence: signal.evidence as unknown as Json,
      source: signal.source,
      confidence: signal.confidence,
    });
  }

  async listRecent(options: ListRecentSignalsOptions = {}): Promise<LearningSignal[]> {
    let query = this.supabase
      .from("learning_signals")
      .select("type, topic, skill, evidence, source, confidence, created_at")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 100);

    if (options.types && options.types.length > 0) query = query.in("type", options.types);
    if (options.since) query = query.gte("created_at", options.since.toISOString());

    const { data } = await query;

    return (data ?? []).map((row) => ({
      type: row.type as SignalType,
      topic: row.topic,
      skill: row.skill as SignalSkill | null,
      evidence: (row.evidence ?? {}) as Record<string, unknown>,
      source: row.source as SignalSource,
      confidence: row.confidence,
      createdAt: row.created_at,
    }));
  }
}

export function createSignalRepository(supabase: SupabaseClient<Database>, userId: string): SignalRepository {
  return new SupabaseSignalRepository(supabase, userId);
}
