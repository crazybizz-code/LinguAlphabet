import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getCachedLearnerProfile } from "@/ai/data";
import { getCachedPublishedPodcasts, getCachedPublishedArticles } from "@/lib/content/queries";
import { buildTodayMinutes } from "@/lib/content/home";

const DEFAULT_DAILY_MINUTES = 20;

export interface LearnerSidebarStats {
  streak: number;
  xp: number;
  /** Null until reported or assessed — the row is omitted rather than showing a placeholder. */
  currentBand: number | null;
  targetBand: number | null;
  dailyGoalPercent: number;
}

/**
 * The left rail's "Learning Status" panel (DashboardSidebar.tsx) needs a
 * small, cheap cross-section of what Dashboard/Progress already compute in
 * full for their own pages — streak/xp/bands come from the same
 * LearnerRepository every AI route already reads (so the sidebar can never
 * independently drift from what Tuto itself knows), and today's goal
 * percent reuses buildTodayMinutes (src/lib/content/home.ts) exactly like
 * Dashboard's own Daily Goal metric, rather than a second, divergent
 * computation. Called once from (app)/layout.tsx — every page under it
 * shares one fetch instead of each page re-deriving the sidebar's numbers.
 * `getCachedLearnerProfile`, not `createLearnerRepository(...).getProfile()`
 * directly, so a page under this layout that needs the same learner's
 * profile for its own content (e.g. /tuto) shares this exact fetch too
 * instead of re-running the same `profiles` + signal-history query again
 * — see that function's own doc comment.
 */
export async function getLearnerSidebarStats(supabase: SupabaseClient<Database>, userId: string): Promise<LearnerSidebarStats> {
  // Sidebar only needs today's completed progress rows to compute the daily-goal
  // percentage (buildTodayMinutes). Filtering at the DB level avoids fetching the
  // entire activity history on every authenticated page load — a query that grows
  // O(n) with all learning ever recorded. The two predicates mirror what
  // buildTodayMinutes already applies in JS, so the result is semantically identical.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [learnerProfile, podcasts, articles, { data: progressRows }] = await Promise.all([
    getCachedLearnerProfile(supabase, userId),
    getCachedPublishedPodcasts(supabase),
    getCachedPublishedArticles(supabase),
    supabase.from("progress").select("*").eq("user_id", userId).eq("completed", true).gte("updated_at", todayStart.toISOString()),
  ]);

  // Already the same `profiles.daily_time_minutes` column
  // getCachedLearnerProfile just read — a second, separate query for it
  // would be pure duplication.
  const dailyGoalMinutes = learnerProfile.dailyGoalMinutes ?? DEFAULT_DAILY_MINUTES;
  const todayMinutes = buildTodayMinutes([...podcasts, ...articles], progressRows ?? []);
  const dailyGoalPercent = dailyGoalMinutes > 0 ? Math.min(100, Math.round((todayMinutes / dailyGoalMinutes) * 100)) : 0;

  return {
    streak: learnerProfile.streak ?? 0,
    xp: learnerProfile.xp ?? 0,
    // Bands, not CEFR. CEFR is derived and used to pitch language
    // complexity; it isn't what the learner is working toward, so it has
    // no business being the one level they see on every screen.
    currentBand: learnerProfile.currentBand,
    targetBand: learnerProfile.targetBand,
    dailyGoalPercent,
  };
}
