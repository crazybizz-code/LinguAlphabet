import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { CEFR_LEVELS, type CefrLevel } from "@/ai/context";
import { LearnerProfileSchema, type LearnerProfile } from "@/ai/learner";

/**
 * Learner Memory — persistent across every session, never scoped to one
 * conversation (that's ConversationRepository, a deliberately separate
 * system — see docs/ai-coach-audit.md's Phase 2 model). Exists to make
 * Tuto a better teacher over time: durable signals like CEFR level, goal,
 * streak, and (once Phase 3's Learning Engine starts writing them)
 * grammar/vocabulary strengths and weaknesses.
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
   * Populates only the fields a real data source exists for today:
   * `profiles.english_level`/`goal`/`streak`/`longest_streak`/`xp`
   * (supabase-schema.sql, supabase/onboarding-fields.sql). Everything
   * else LearnerProfileSchema defines — strong/weak grammar and
   * vocabulary topics, recent mistakes, learning style/pace — has no
   * data source yet; that's Phase 3 (the Learning Engine)'s job to start
   * writing, not this repository's to invent. LearnerProfileSchema.parse()
   * defaults every unset field to null/[] rather than guessing, the same
   * rule buildLearningContext() already follows for LearningContext.
   */
  async getProfile(): Promise<LearnerProfile> {
    const { data } = await this.supabase
      .from("profiles")
      .select("english_level, goal, streak, longest_streak, xp")
      .eq("user_id", this.userId)
      .maybeSingle();

    return LearnerProfileSchema.parse({
      id: this.userId,
      cefrLevel: toCefrLevel(data?.english_level),
      learningGoal: data?.goal ?? null,
      streak: data?.streak ?? null,
      xp: data?.xp ?? null,
      studyConsistency: data ? { longestStreak: data.longest_streak ?? null } : null,
    });
  }
}

export function createLearnerRepository(supabase: SupabaseClient<Database>, userId: string): LearnerRepository {
  return new SupabaseLearnerRepository(supabase, userId);
}
