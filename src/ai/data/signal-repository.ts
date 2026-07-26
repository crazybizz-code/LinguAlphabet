import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";

export const SIGNAL_TYPES = [
  // Objective / mechanical — real evidence exists today, no model judgment
  // involved. Emitted by this phase.
  "article_completed",
  "podcast_completed",
  "quiz_completed",
  "vocabulary_viewed",
  "vocabulary_saved",
  "explanation_requested",
  // Reserved in the taxonomy, not yet emitted anywhere — no real,
  // non-fabricated evidence source exists for these today. hint_requested
  // has no UI concept of a "hint" distinct from a lookup/explanation yet;
  // reading_time/listening_time have no real elapsed-time measurement
  // reaching the server (completeMission only ever receives the content's
  // static estimated duration, not time actually spent — see
  // src/lib/learning-session/complete-mission.ts). Adding a real emitter
  // for any of these three is additive whenever real evidence exists;
  // faking one now from a proxy would be exactly the "store a conclusion
  // instead of deriving it from evidence" mistake this phase exists to
  // avoid.
  "hint_requested",
  "reading_time",
  "listening_time",
  // Judgment-based — reserved for a later phase, never emitted yet.
  // Whatever emits one of these in the future MUST set `confidence` to a
  // real 0-1 estimate, never null — see LearningSignal.confidence below.
  "grammar_mistake",
  "grammar_mastered",
  "vocabulary_mastered",
  "vocabulary_struggled",
  "confidence_drop",
  "confidence_gain",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export type SignalSkill = "grammar" | "vocabulary" | "listening" | "reading" | "speaking" | "writing";
export type SignalSource = "content_session" | "vocabulary_lookup" | "chat";

export interface LearningSignal {
  type: SignalType;
  topic: string | null;
  skill: SignalSkill | null;
  /** Structured, objective grounding — never just a bare conclusion. Shape varies by signal type; see each emission site for what it records. */
  evidence: Record<string, unknown>;
  source: SignalSource;
  /**
   * Only meaningful for judgment-based signals. Every signal this phase
   * emits is mechanical/objective and records `null` here deliberately —
   * it isn't a probability estimate, it's a fact that either happened or
   * didn't. A future judgment-based emitter (grammar_mistake, etc.) must
   * supply a real 0-1 value here, per the user's own rule: every
   * AI-generated signal carries confidence, evidence, and source.
   */
  confidence: number | null;
}

export interface ListRecentSignalsOptions {
  types?: SignalType[];
  since?: Date;
  limit?: number;
}

/**
 * Repositories store signals, not conclusions. This is the append-only
 * evidence log every objective interaction writes to and everything else
 * reads from — LearnerRepository summarizes it into a LearnerProfile,
 * and a future Learning Engine reasons over the raw stream directly for
 * patterns a single summary can't capture (three separate
 * `grammar_mistake` signals on the same topic across three sessions,
 * say). No update() or delete() method exists here on purpose, and the
 * backing table (supabase/learning-signals-schema.sql) grants only
 * INSERT/SELECT — the same "Progress is mutable state, Completion is an
 * immutable event" split docs/domain-model.md §15 already established
 * for engagement, applied here to teaching signals: a correction is a
 * new signal, never an edit to an old one.
 */
export interface SignalRepository {
  record(signal: LearningSignal): Promise<void>;
  listRecent(options?: ListRecentSignalsOptions): Promise<LearningSignal[]>;
}

class SupabaseSignalRepository implements SignalRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async record(signal: LearningSignal): Promise<void> {
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
      .select("type, topic, skill, evidence, source, confidence")
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
    }));
  }
}

export function createSignalRepository(supabase: SupabaseClient<Database>, userId: string): SignalRepository {
  return new SupabaseSignalRepository(supabase, userId);
}
