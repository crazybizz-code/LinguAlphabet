import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { CEFR_LEVELS, type CefrLevel } from "@/ai/context";
import { LearnerProfileSchema, type LearnerProfile } from "@/ai/learner";
import { createSignalRepository } from "./signal-repository";

/** How many recent signals to look at when deriving recentlyStudiedTopics — a summary, not a full history dump. */
const RECENT_TOPIC_SIGNAL_LIMIT = 20;
const RECENT_TOPIC_LIMIT = 5;

/**
 * Learner Memory — persistent across every session, never scoped to one
 * conversation (that's ConversationRepository, a deliberately separate
 * system). Exists to make Tuto a better teacher over time. Per the
 * signal-based model (docs/ai-coach-audit.md's Phase 3 note): this
 * repository never stores its own conclusions — it summarizes them, on
 * read, from SignalRepository's append-only evidence log. A learner's
 * "weak topics" isn't a column anyone writes; it's arithmetic over
 * repeated grammar_mistake signals with no later grammar_mastered for
 * the same topic.
 */
export interface LearnerRepository {
  getProfile(): Promise<LearnerProfile>;
}

function toCefrLevel(value: string | null | undefined): CefrLevel | null {
  return value && (CEFR_LEVELS as readonly string[]).includes(value) ? (value as CefrLevel) : null;
}

class SupabaseLearnerRepository implements LearnerRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  /**
   * `cefrLevel`/`learningGoal`/`streak`/`xp` come from `profiles`
   * (supabase-schema.sql, supabase/onboarding-fields.sql) — the app's
   * existing onboarding/reward system, not something this repository
   * derives itself. `recentlyStudiedTopics` is the first real derivation:
   * distinct topics from this phase's objective signals
   * (explanation_requested, vocabulary_viewed), most recent first — real
   * evidence exists for it today. `strongGrammarTopics`/
   * `weakGrammarTopics`/`strongVocabularyAreas`/`weakVocabularyAreas`/
   * `recentMistakes` stay empty: deriving them needs judgment-based
   * signals (grammar_mistake, grammar_mastered, etc.) that nothing emits
   * yet (see src/ai/data/signal-repository.ts's SIGNAL_TYPES) — an empty
   * array here is the honest result of an aggregation with no matching
   * evidence, not a placeholder standing in for unbuilt logic.
   */
  async getProfile(): Promise<LearnerProfile> {
    const signalRepository = createSignalRepository(this.supabase, this.userId);

    const [{ data: profile }, recentTopicSignals] = await Promise.all([
      this.supabase.from("profiles").select("english_level, goal, streak, longest_streak, xp").eq("user_id", this.userId).maybeSingle(),
      signalRepository.listRecent({ types: ["explanation_requested", "vocabulary_viewed"], limit: RECENT_TOPIC_SIGNAL_LIMIT }),
    ]);

    const recentlyStudiedTopics = Array.from(new Set(recentTopicSignals.map((signal) => signal.topic).filter((topic): topic is string => Boolean(topic)))).slice(
      0,
      RECENT_TOPIC_LIMIT,
    );

    return LearnerProfileSchema.parse({
      id: this.userId,
      cefrLevel: toCefrLevel(profile?.english_level),
      learningGoal: profile?.goal ?? null,
      streak: profile?.streak ?? null,
      xp: profile?.xp ?? null,
      recentlyStudiedTopics,
      studyConsistency: profile ? { longestStreak: profile.longest_streak ?? null } : null,
    });
  }
}

export function createLearnerRepository(supabase: SupabaseClient<Database>, userId: string): LearnerRepository {
  return new SupabaseLearnerRepository(supabase, userId);
}
