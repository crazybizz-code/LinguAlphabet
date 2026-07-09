import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublishedPodcasts } from "@/lib/content/queries";
import { buildWeeklyMinutes, getTimeGreeting } from "@/lib/content/home";
import { learningBrain } from "@/lib/learning-brain";
import type { LearnerContext, RecentCompletion } from "@/lib/learning-brain";
import { buildTutoNote } from "@/lib/tuto/messages";
import { HomeView } from "@/components/dashboard/HomeView";

const DEFAULT_DAILY_MINUTES = 20;
const RECENT_COMPLETION_WINDOW_MS = 6 * 60 * 60 * 1000;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, podcasts, { data: progressRows }, { data: previousMission }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, level, streak, last_study_date, english_level, goal, daily_time_minutes, interests")
      .eq("user_id", user.id)
      .single(),
    getPublishedPodcasts(supabase),
    supabase.from("progress").select("*").eq("user_id", user.id),
    supabase
      .from("daily_missions")
      .select("*")
      .eq("user_id", user.id)
      .lt("mission_date", new Date().toISOString().slice(0, 10))
      .order("mission_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = progressRows ?? [];
  const dailyMinutes = profile?.daily_time_minutes ?? DEFAULT_DAILY_MINUTES;
  const byId = new Map(podcasts.map((podcast) => [podcast.id, podcast]));

  const previousMissionContent = previousMission ? byId.get(previousMission.content_item_id) : undefined;

  const completedRows = rows.filter((row) => row.completed);
  const recentCompletions: RecentCompletion[] = completedRows
    .map((row) => {
      const podcast = byId.get(row.content_item_id);
      return podcast ? { cefrLevel: podcast.cefrLevelMin, completedAt: row.updated_at } : null;
    })
    .filter((completion): completion is RecentCompletion => completion !== null);

  const baseLevel = (profile?.english_level as LearnerContext["englishLevel"]) ?? null;
  const effectiveLevel = learningBrain.getEffectiveLevel(baseLevel, recentCompletions);

  const context: LearnerContext = {
    englishLevel: effectiveLevel,
    goal: profile?.goal ?? null,
    interests: profile?.interests ?? [],
    completedContentIds: new Set(completedRows.map((row) => row.content_item_id)),
    previousMissionContentType: previousMissionContent?.contentType ?? null,
  };

  const { mission, tutoRecommends, completedTodaysMissionTitle } = await learningBrain.getHomeRecommendations({
    supabase,
    userId: user.id,
    catalog: podcasts,
    progressRows: rows,
    context,
  });

  const now = new Date().getTime();
  const recentCompletionRow = completedRows
    .filter((row) => now - new Date(row.updated_at).getTime() <= RECENT_COMPLETION_WINDOW_MS)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  const recentCompletionTitle = recentCompletionRow ? (byId.get(recentCompletionRow.content_item_id)?.title ?? null) : null;

  const daysSinceLastStudy = profile?.last_study_date
    ? Math.floor((now - new Date(profile.last_study_date).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const weeklyMinutes = buildWeeklyMinutes(podcasts, rows);
  const weeklyGoalMinutes = dailyMinutes * 7;

  const tutoNote = buildTutoNote({
    streak: profile?.streak ?? 0,
    weeklyMinutes,
    weeklyGoalMinutes,
    // The Today's Mission Complete banner already congratulates the learner
    // by name for this exact completion — don't say it twice in Tuto's note.
    recentCompletionTitle: recentCompletionTitle === completedTodaysMissionTitle ? null : recentCompletionTitle,
    daysSinceLastStudy,
  });

  return (
    <HomeView
      displayName={profile?.username || "there"}
      greeting={getTimeGreeting()}
      streak={profile?.streak ?? 0}
      level={profile?.level ?? 1}
      weeklyMinutes={weeklyMinutes}
      weeklyGoalMinutes={weeklyGoalMinutes}
      mission={mission}
      completedTodaysMissionTitle={completedTodaysMissionTitle}
      tutoNote={tutoNote}
      recommendations={tutoRecommends}
    />
  );
}
