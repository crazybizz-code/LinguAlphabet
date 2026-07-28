import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { CefrLevel } from "@/ai/context";
import { createLearnerRepository } from "@/ai/data";
import { getPublishedPodcasts, getPublishedArticles } from "@/lib/content/queries";
import { buildTodayMinutes } from "@/lib/content/home";

const DEFAULT_DAILY_MINUTES = 20;

export interface LearnerSidebarStats {
  streak: number;
  xp: number;
  cefrLevel: CefrLevel | null;
  dailyGoalPercent: number;
}

/**
 * The left rail's "Learning Status" panel (DashboardSidebar.tsx) needs a
 * small, cheap cross-section of what Dashboard/Progress already compute in
 * full for their own pages — streak/xp/cefrLevel come from the same
 * LearnerRepository every AI route already reads (so the sidebar can never
 * independently drift from what Tuto itself knows), and today's goal
 * percent reuses buildTodayMinutes (src/lib/content/home.ts) exactly like
 * Dashboard's own Daily Goal metric, rather than a second, divergent
 * computation. Called once from (app)/layout.tsx — every page under it
 * shares one fetch instead of each page re-deriving the sidebar's numbers.
 */
export async function getLearnerSidebarStats(supabase: SupabaseClient<Database>, userId: string): Promise<LearnerSidebarStats> {
  const [learnerProfile, { data: profile }, podcasts, articles, { data: progressRows }] = await Promise.all([
    createLearnerRepository(supabase, userId).getProfile(),
    supabase.from("profiles").select("daily_time_minutes").eq("user_id", userId).single(),
    getPublishedPodcasts(supabase),
    getPublishedArticles(supabase),
    supabase.from("progress").select("*").eq("user_id", userId),
  ]);

  const dailyGoalMinutes = profile?.daily_time_minutes ?? DEFAULT_DAILY_MINUTES;
  const todayMinutes = buildTodayMinutes([...podcasts, ...articles], progressRows ?? []);
  const dailyGoalPercent = dailyGoalMinutes > 0 ? Math.min(100, Math.round((todayMinutes / dailyGoalMinutes) * 100)) : 0;

  return {
    streak: learnerProfile.streak ?? 0,
    xp: learnerProfile.xp ?? 0,
    cefrLevel: learnerProfile.cefrLevel,
    dailyGoalPercent,
  };
}
