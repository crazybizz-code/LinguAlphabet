import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublishedPodcasts } from "@/lib/content/queries";
import { buildWeeklyMinutes, getTimeGreeting } from "@/lib/content/home";
import { getHomeRecommendations } from "@/lib/learning-brain/home-recommendations";
import type { LearnerContext } from "@/lib/learning-brain/types";
import { HomeView } from "@/components/dashboard/HomeView";

const DEFAULT_DAILY_MINUTES = 20;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, podcasts, { data: progressRows }, { data: previousMission }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
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

  const previousMissionContent = previousMission
    ? podcasts.find((podcast) => podcast.id === previousMission.content_item_id)
    : undefined;

  const context: LearnerContext = {
    englishLevel: (profile?.english_level as LearnerContext["englishLevel"]) ?? null,
    goal: profile?.goal ?? null,
    interests: profile?.interests ?? [],
    completedContentIds: new Set(rows.filter((row) => row.completed).map((row) => row.content_item_id)),
    previousMissionContentType: previousMissionContent?.contentType ?? null,
  };

  const { todaysMission, tutoRecommends } = await getHomeRecommendations({
    supabase,
    userId: user.id,
    catalog: podcasts,
    progressRows: rows,
    context,
  });

  return (
    <HomeView
      displayName={profile?.username || "there"}
      greeting={getTimeGreeting()}
      streak={profile?.streak ?? 0}
      level={profile?.level ?? 1}
      weeklyMinutes={buildWeeklyMinutes(podcasts, rows)}
      weeklyGoalMinutes={dailyMinutes * 7}
      todaysMission={todaysMission}
      recommendations={tutoRecommends}
    />
  );
}
