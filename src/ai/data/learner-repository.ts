import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { CEFR_LEVELS, type CefrLevel } from "@/ai/context";
import { LearnerProfileSchema, type LearnerProfile } from "@/ai/learner";
import { computeLearnerState, type LearnerState } from "@/ai/learning-engine";
import { createSignalRepository } from "./signal-repository";

/** How much signal history to compute a LearnerState from — enough for meaningful mastery/momentum patterns, not a full history dump. Tunable once there's real volume to tune against. */
const SIGNAL_HISTORY_LIMIT = 200;

/**
 * Learner Memory — persistent across every session, never scoped to one
 * conversation (that's ConversationRepository, a deliberately separate
 * system). Exists to make Tuto a better teacher over time. Per the
 * signal-based model (docs/learning-signal-specification.md): this
 * repository never stores its own conclusions — it summarizes them, on
 * read, by delegating to src/ai/learning-engine's computeLearnerState()
 * over SignalRepository's append-only evidence log. A learner's "weak
 * topics" isn't a column anyone writes; it's the Learning Engine's
 * arithmetic over the raw signal history, fresh every call.
 */
export interface LearnerRepository {
  /** The thin, prompt-facing projection (Sprint 10's LearnerProfile shape) — what the LLM actually sees. */
  getProfile(): Promise<LearnerProfile>;
  /** The full Learning Engine output — every consumer that needs more than the prompt does (a future Coach Planner, a debug view) should read this directly rather than re-deriving it. */
  getLearnerState(): Promise<LearnerState>;
}

function toCefrLevel(value: string | null | undefined): CefrLevel | null {
  return value && (CEFR_LEVELS as readonly string[]).includes(value) ? (value as CefrLevel) : null;
}

class SupabaseLearnerRepository implements LearnerRepository {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async getLearnerState(): Promise<LearnerState> {
    const signalRepository = createSignalRepository(this.supabase, this.userId);
    const signals = await signalRepository.listRecent({ limit: SIGNAL_HISTORY_LIMIT });
    return computeLearnerState(this.userId, signals);
  }

  /**
   * `cefrLevel`/`learningGoal`/`streak`/`xp`/`dailyGoalMinutes` come from
   * `profiles` (supabase-schema.sql, supabase/onboarding-fields.sql) — the
   * app's existing onboarding/reward system, not something the Learning
   * Engine derives. Everything else is a projection of getLearnerState():
   * `recentlyStudiedTopics` maps straight across; `strongGrammarTopics`/
   * `weakGrammarTopics`/`strongVocabularyAreas`/`weakVocabularyAreas` are
   * `grammarMastery`/`vocabularyMastery` filtered by status — real once
   * `quiz_answer_recorded` evidence exists for a topic (QuizStep records
   * it per answer), honestly empty until then. `recentMistakes` stays
   * empty regardless: per LearnerProfileSchema's own doc comment it's "a
   * rolling digest... derived from recent PerformanceRecords," which is
   * closer to Tier 3 evidence excerpts than a topic list — nothing
   * produces that yet.
   */
  async getProfile(): Promise<LearnerProfile> {
    const [{ data: profile }, learnerState] = await Promise.all([
      this.supabase
        .from("profiles")
        .select(
          "english_level, goal, streak, longest_streak, xp, daily_time_minutes, current_band, target_band, exam_timeline, exam_date, placement_completed",
        )
        .eq("user_id", this.userId)
        .maybeSingle(),
      this.getLearnerState(),
    ]);

    return LearnerProfileSchema.parse({
      id: this.userId,
      cefrLevel: toCefrLevel(profile?.english_level),
      learningGoal: profile?.goal ?? null,
      currentBand: profile?.current_band ?? null,
      targetBand: profile?.target_band ?? null,
      examTimeline: profile?.exam_timeline ?? null,
      examDate: profile?.exam_date ?? null,
      placementCompleted: profile?.placement_completed ?? false,
      streak: profile?.streak ?? null,
      xp: profile?.xp ?? null,
      dailyGoalMinutes: profile?.daily_time_minutes ?? null,
      recentlyStudiedTopics: learnerState.recentlyStudiedTopics,
      strongGrammarTopics: learnerState.grammarMastery.filter((record) => record.status === "mastered").map((record) => record.topic),
      weakGrammarTopics: learnerState.grammarMastery.filter((record) => record.status === "weak").map((record) => record.topic),
      strongVocabularyAreas: learnerState.vocabularyMastery.filter((record) => record.status === "mastered").map((record) => record.topic),
      weakVocabularyAreas: learnerState.vocabularyMastery.filter((record) => record.status === "weak").map((record) => record.topic),
      studyConsistency: profile ? { longestStreak: profile.longest_streak ?? null } : null,
    });
  }
}

export function createLearnerRepository(supabase: SupabaseClient<Database>, userId: string): LearnerRepository {
  return new SupabaseLearnerRepository(supabase, userId);
}

/**
 * `getProfile()` (a `profiles` row plus `getLearnerState()`'s own signal
 * query + Learning Engine computation) reads that are identical for a
 * given (supabase, userId) pair within the same server request should
 * only actually run once — e.g. `/tuto` has both `(app)/layout.tsx` (the
 * sidebar's Learning Status panel) and the page itself asking for the
 * same learner's profile. `React.cache()`'s memoization keys on argument
 * identity, so this only actually dedupes when `supabase` is the same
 * cached client instance every caller gets from
 * `src/lib/supabase/server.ts`'s `createClient()` — pass that one, not a
 * fresh client, for this to do anything.
 *
 * A Server Action or Route Handler that mutates the `profiles` row and
 * then needs a truly fresh read back in the *same* request should still
 * call `createLearnerRepository(...).getProfile()` directly rather than
 * this — each such request gets its own fresh `cache()` scope regardless
 * (so staleness never leaks across requests), but a call already cached
 * earlier *within* this same request would still return the pre-mutation
 * value.
 */
export const getCachedLearnerProfile = cache(async (supabase: SupabaseClient<Database>, userId: string): Promise<LearnerProfile> => {
  return createLearnerRepository(supabase, userId).getProfile();
});
